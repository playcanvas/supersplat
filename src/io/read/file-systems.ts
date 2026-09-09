/**
 * File system implementations for reading splat data from various sources.
 */

import {
    BufferedReadStream,
    ReadFileSystem,
    ReadSource,
    ReadStream,
    UrlReadFileSystem
} from '@playcanvas/splat-transform';

// Read blob in 4MB chunks to balance async overhead vs memory usage
const BLOB_CHUNK_SIZE = 4 * 1024 * 1024;

type Backup = {
    dir: FileSystemDirectoryHandle;
    sources: Set<BlobReadSource>;
};

const backups = new Map<FileSystemFileHandle, Backup>();

/**
 * ReadStream implementation for reading from Blob/File.
 */
class BlobReadStream extends ReadStream {
    private blob: Blob;
    private offset: number;
    private end: number;

    constructor(blob: Blob, start: number, end: number) {
        super(end - start);
        this.blob = blob;
        this.offset = start;
        this.end = end;
    }

    async pull(target: Uint8Array): Promise<number> {
        const remaining = this.end - this.offset;
        if (remaining <= 0) {
            return 0;
        }

        const bytesToRead = Math.min(target.length, remaining);
        const slice = this.blob.slice(this.offset, this.offset + bytesToRead);
        const arrayBuffer = await slice.arrayBuffer();
        target.set(new Uint8Array(arrayBuffer));
        this.offset += bytesToRead;
        this.bytesRead += bytesToRead;
        return bytesToRead;
    }
}

/**
 * ReadSource implementation for Blob/File.
 */
class BlobReadSource implements ReadSource {
    readonly size: number;
    readonly seekable: boolean = true;

    // The on-disk file `blob` came from, when known. Before overwriting it,
    // backupSources redirects reads to an identical sibling copy.
    handle: FileSystemFileHandle | null;

    private blob: Blob;
    private closed: boolean = false;
    private backup: FileSystemFileHandle | null = null;

    constructor(blob: Blob, handle: FileSystemFileHandle | null = null) {
        this.blob = blob;
        this.handle = handle;
        this.size = blob.size;
    }

    read(start: number = 0, end: number = this.size): ReadStream {
        if (this.closed) {
            throw new Error('Source has been closed');
        }

        const clampedStart = Math.max(0, Math.min(start, this.size));
        const clampedEnd = Math.max(clampedStart, Math.min(end, this.size));

        // Wrap with BufferedReadStream to reduce async overhead from blob reads
        const raw = new BlobReadStream(this.blob, clampedStart, clampedEnd);
        return new BufferedReadStream(raw, BLOB_CHUNK_SIZE);
    }

    private releaseBackup(): void {
        if (!this.backup) return;
        const handle = this.backup;
        const backup = backups.get(handle);
        this.backup = null;
        backup.sources.delete(this);
        if (backup.sources.size === 0) {
            backup.dir.removeEntry(handle.name).catch(() => {}).finally(() => backups.delete(handle));
        }
    }

    redirect(blob: Blob, handle: FileSystemFileHandle, dir: FileSystemDirectoryHandle): void {
        this.releaseBackup();
        this.blob = blob;
        this.handle = handle;
        this.backup = handle;
        if (!backups.has(handle)) {
            backups.set(handle, { dir, sources: new Set() });
        }
        backups.get(handle).sources.add(this);
    }

    close(): void {
        if (this.closed) return;
        this.closed = true;
        this.handle = null;
        this.releaseBackup();
    }
}

// Every live source reading from the file behind `handle`.
const sourcesOf = async (sources: Iterable<BlobReadSource>, handle: FileSystemFileHandle): Promise<BlobReadSource[]> => {
    const result: BlobReadSource[] = [];
    for (const source of new Set(sources)) {
        if (source.handle && await handle.isSameEntry(source.handle)) {
            result.push(source);
        }
    }
    return result;
};

const backupName = async (dir: FileSystemDirectoryHandle, name: string): Promise<string> => {
    for (let i = 0; ; ++i) {
        const candidate = `${name}${i ? `.${i}` : ''}.ssbak`;
        try {
            await dir.getFileHandle(candidate);
        } catch (error) {
            if (error.name === 'NotFoundError') return candidate;
            if (error.name !== 'TypeMismatchError') throw error;
        }
    }
};

// Finish the streaming copy before redirecting any source or touching the target.
const backupSources = async (sources: BlobReadSource[], dir: FileSystemDirectoryHandle, handle: FileSystemFileHandle, name: string): Promise<void> => {
    const file = await handle.getFile();
    const backup = await dir.getFileHandle(name, { create: true });
    let blob: File;
    try {
        await file.stream().pipeTo(await backup.createWritable());
        blob = await backup.getFile();
    } catch (error) {
        await dir.removeEntry(name).catch(() => {});
        throw error;
    }
    for (const source of sources) {
        source.redirect(blob, backup, dir);
    }
};

/**
 * ReadFileSystem for reading from browser File/Blob objects.
 * Used for drag & drop and file picker scenarios.
 */
class BlobReadFileSystem implements ReadFileSystem {
    private files: Map<string, { blob: Blob, handle: FileSystemFileHandle | null }> = new Map();

    // every source handed out, so the owner knows which files are in use
    readonly sources: BlobReadSource[] = [];

    /**
     * Add a file to the file system.
     */
    set(name: string, blob: Blob, handle: FileSystemFileHandle | null = null): void {
        this.files.set(name.toLowerCase(), { blob, handle });
    }

    /**
     * Get a file by name.
     */
    get(name: string): Blob | undefined {
        return this.files.get(name.toLowerCase())?.blob;
    }

    createSource(filename: string): Promise<ReadSource> {
        const entry = this.files.get(filename.toLowerCase());
        if (!entry) {
            return Promise.reject(new Error(`File not found: ${filename}`));
        }
        const source = new BlobReadSource(entry.blob, entry.handle);
        this.sources.push(source);
        return Promise.resolve(source);
    }
}

/**
 * ReadFileSystem that combines URL-based loading with local file storage.
 * Used for multi-file formats (SOG, LCC) where some files may be local
 * and others may need to be fetched from URLs.
 */
class MappedReadFileSystem implements ReadFileSystem {
    private blobFs: BlobReadFileSystem;
    private urlFs: UrlReadFileSystem;

    constructor(baseUrl?: string) {
        this.blobFs = new BlobReadFileSystem();
        this.urlFs = new UrlReadFileSystem(baseUrl);
    }

    /**
     * Add a local file.
     */
    addFile(name: string, blob: Blob, handle: FileSystemFileHandle | null = null): void {
        this.blobFs.set(name, blob, handle);
    }

    // the sources handed out over local files
    get sources(): BlobReadSource[] {
        return this.blobFs.sources;
    }

    async createSource(filename: string): Promise<ReadSource> {
        // First check if we have a local blob
        if (this.blobFs.get(filename)) {
            return await this.blobFs.createSource(filename);
        }

        // Fall back to URL loading
        return await this.urlFs.createSource(filename);
    }
}

export {
    backupName,
    backupSources,
    BlobReadSource,
    MappedReadFileSystem,
    sourcesOf
};
