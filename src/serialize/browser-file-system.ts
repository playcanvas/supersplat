/**
 * Browser FileSystem implementation for splat-transform compatibility.
 * Provides FileSystem abstraction for browser file operations.
 */

import type { FileSystem, Writer } from '@playcanvas/splat-transform';

/**
 * Writer implementation for FileSystemWritableFileStream (File System Access API).
 */
class BrowserFileWriter implements Writer {
    private stream: FileSystemWritableFileStream;
    private cursor: number = 0;
    private ready: Promise<void>;

    constructor(stream: FileSystemWritableFileStream) {
        this.stream = stream;
        this.ready = this.stream.seek(0);
    }

    async write(data: Uint8Array): Promise<void> {
        await this.ready;
        this.cursor += data.byteLength;
        await this.stream.write(data as unknown as ArrayBuffer);
    }

    async close(): Promise<void> {
        await this.ready;
        await this.stream.truncate(this.cursor);
        await this.stream.close();
    }
}

/**
 * Writer implementation that triggers a browser download on close.
 */
class BrowserDownloadWriter implements Writer {
    private buffers: Uint8Array[] = [];
    private buffer: Uint8Array | null = null;
    private cursor: number = 0;
    private filename: string;

    constructor(filename: string) {
        this.filename = filename;
    }

    write(data: Uint8Array): void {
        let readcursor = 0;

        while (readcursor < data.byteLength) {
            const readSize = data.byteLength - readcursor;

            // allocate buffer
            if (!this.buffer) {
                this.buffer = new Uint8Array(Math.max(5 * 1024 * 1024, readSize));
            }

            const writeSize = this.buffer.byteLength - this.cursor;
            const copySize = Math.min(readSize, writeSize);

            this.buffer.set(data.subarray(readcursor, readcursor + copySize), this.cursor);

            readcursor += copySize;
            this.cursor += copySize;

            if (this.cursor === this.buffer.byteLength) {
                this.buffers.push(this.buffer);
                this.buffer = null;
                this.cursor = 0;
            }
        }
    }

    close(): void {
        if (this.buffer) {
            this.buffers.push(new Uint8Array(this.buffer.buffer, 0, this.cursor));
            this.buffer = null;
            this.cursor = 0;
        }

        // download file to client
        const blob = new Blob(this.buffers as unknown as ArrayBuffer[], { type: 'application/octet-stream' });
        const url = window.URL.createObjectURL(blob);

        const lnk = document.createElement('a');
        lnk.download = this.filename;
        lnk.href = url;

        // create a "fake" click-event to trigger the download
        if (document.createEvent) {
            const e = document.createEvent('MouseEvents');
            e.initMouseEvent('click', true, true, window,
                0, 0, 0, 0, 0, false, false, false,
                false, 0, null);
            lnk.dispatchEvent(e);
        } else {
            // @ts-ignore
            lnk.fireEvent?.('onclick');
        }

        window.URL.revokeObjectURL(url);
    }
}

/**
 * FileSystem implementation for browser environments.
 * Supports both File System Access API (stream) and fallback download.
 */
class BrowserFileSystem implements FileSystem {
    private stream?: FileSystemWritableFileStream;
    private filename: string;

    /**
     * Create a BrowserFileSystem.
     * @param filename - The filename for downloads (fallback mode)
     * @param stream - Optional FileSystemWritableFileStream for direct file access
     */
    constructor(filename: string, stream?: FileSystemWritableFileStream) {
        this.filename = filename;
        this.stream = stream;
    }

    createWriter(_filename: string): Writer {
        if (this.stream) {
            return new BrowserFileWriter(this.stream);
        }
        return new BrowserDownloadWriter(this.filename);
    }

    mkdir(_path: string): Promise<void> {
        // No-op in browser - directories not supported
        return Promise.resolve();
    }
}

export { BrowserFileSystem, BrowserFileWriter, BrowserDownloadWriter };
