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

    private blob: Blob;
    private closed: boolean = false;

    constructor(blob: Blob) {
        this.blob = blob;
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
        this.closed = true;
    }
}

/**
 * ReadFileSystem for reading from browser File/Blob objects.
 * Used for drag & drop and file picker scenarios.
 */
class BlobReadFileSystem implements ReadFileSystem {
    private files: Map<string, Blob> = new Map();

    /**
     * Add a file to the file system.
     */
    set(name: string, blob: Blob): void {
        this.files.set(name.toLowerCase(), blob);
    }

    /**
     * Get a file by name.
     */
    get(name: string): Blob | undefined {
        return this.files.get(name.toLowerCase());
    }

    createSource(filename: string): Promise<ReadSource> {
        const blob = this.files.get(filename.toLowerCase());
        if (!blob) {
            return Promise.reject(new Error(`File not found: ${filename}`));
        }
        return Promise.resolve(new BlobReadSource(blob));
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
    addFile(name: string, blob: Blob): void {
        this.blobFs.set(name, blob);
    }

    async createSource(filename: string): Promise<ReadSource> {
        // First check if we have a local blob
        const localBlob = this.blobFs.get(filename);
        if (localBlob) {
            return new BlobReadSource(localBlob);
        }

        // Fall back to URL loading
        return await this.urlFs.createSource(filename);
    }
}

export {
    BlobReadSource,
    MappedReadFileSystem
};
