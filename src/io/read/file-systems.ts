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

    // The on-disk file `blob` came from, when known. Writes to it are refused
    // while the source is in use (see scene.sourcesOf).
    handle: FileSystemFileHandle | null;

    private blob: Blob;
    private closed: boolean = false;

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

    close(): void {
        if (this.closed) return;
        this.closed = true;
        this.handle = null;
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

// Progress through one file: bytes pulled from it so far, its size when known,
// and its name. Reported per file rather than summed over the load because
// multi-file formats open files one after another, each read to the end before
// the next is opened, so a running total would sit at 100% nearly throughout.
type LoadProgressCallback = (bytesLoaded: number, totalBytes: number | undefined, filename: string) => void;

// A file system that can report how much of its sources has been read.
interface LoadProgressFileSystem extends ReadFileSystem {
    onProgress: LoadProgressCallback | null;
}

const hasLoadProgress = (fs: ReadFileSystem): fs is LoadProgressFileSystem => 'onProgress' in fs;

// Forwards pulls to `inner`, reporting each pulled byte count. Progress is only
// as fine as the consumer's pulls: a whole-file pull (URL sources read this
// way) reports once, at 100%. Capping pulls to get finer steps was measured at
// ~0.1 s per GB on local files, so the bar isn't worth it.
class CountingReadStream extends ReadStream {
    constructor(private inner: ReadStream, private onBytes: (n: number) => void) {
        super(inner.expectedSize);
    }

    async pull(target: Uint8Array): Promise<number> {
        const n = await this.inner.pull(target);
        this.bytesRead += n;
        this.onBytes(n);
        return n;
    }

    close(): void {
        this.inner.close();
    }
}

/**
 * ReadFileSystem that combines URL-based loading with local file storage.
 * Used for multi-file formats (SOG, LCC) where some files may be local
 * and others may need to be fetched from URLs.
 *
 * Reads through every source it hands out are counted and reported per file
 * via `onProgress`, so a caller can show load progress by bytes whatever the
 * format. Set it for the duration of a load and clear it afterwards: the
 * retained sources keep reading later (export, save) and those reads count
 * too.
 */
class MappedReadFileSystem implements LoadProgressFileSystem {
    private blobFs: BlobReadFileSystem;
    private urlFs: UrlReadFileSystem;

    onProgress: LoadProgressCallback | null = null;

    constructor(baseUrl?: string) {
        this.blobFs = new BlobReadFileSystem();
        this.urlFs = new UrlReadFileSystem(baseUrl);
    }

    // Wrap a source so its reads feed `onProgress`. `sources` still exposes the
    // underlying blob sources (file identity checks rely on the real objects).
    private track(source: ReadSource, filename: string): ReadSource {
        let bytesLoaded = 0;
        const onBytes = (n: number) => {
            bytesLoaded += n;
            this.onProgress?.(bytesLoaded, source.size, filename);
        };
        return {
            size: source.size,
            seekable: source.seekable,
            read: (start?: number, end?: number) => new CountingReadStream(source.read(start, end), onBytes),
            close: () => source.close()
        };
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
            return this.track(await this.blobFs.createSource(filename), filename);
        }

        // Fall back to URL loading. A server without range support (or one
        // that hides Content-Range behind CORS) makes the URL file system
        // download the whole file inside createSource, before any stream exists
        // to count, so forward its native progress for that transfer. The
        // source it then returns is in memory and needs no counting. A ranged
        // source only reports a zero-byte start here and is counted per read.
        let creating = true;
        let downloaded = false;
        const source = await this.urlFs.createSource(filename, (loaded, total) => {
            if (!creating) return;
            if (loaded > 0) downloaded = true;
            this.onProgress?.(loaded, total, filename);
        });
        creating = false;
        return downloaded ? source : this.track(source, filename);
    }
}

export {
    BlobReadSource,
    MappedReadFileSystem,
    hasLoadProgress,
    sourcesOf,
    type LoadProgressFileSystem
};
