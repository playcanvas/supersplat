/**
 * Browser FileSystem implementation for splat-transform compatibility.
 * Provides FileSystem abstraction for browser file operations.
 */

import { MemoryFileSystem, type FileSystem, type Writer } from '@playcanvas/splat-transform';

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
 * Trigger a browser download for the given data.
 */
const triggerDownload = (data: Uint8Array, filename: string): void => {
    const blob = new Blob([data as BlobPart], { type: 'application/octet-stream' });
    const url = window.URL.createObjectURL(blob);

    const lnk = document.createElement('a');
    lnk.download = filename;
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
};

/**
 * Writer implementation that triggers a browser download on close.
 * Uses MemoryFileSystem internally for efficient buffer management.
 */
class BrowserDownloadWriter implements Writer {
    private memFs: MemoryFileSystem;
    private innerWriter: Writer;
    private filename: string;

    constructor(filename: string) {
        this.filename = filename;
        this.memFs = new MemoryFileSystem();
        this.innerWriter = this.memFs.createWriter(filename);
    }

    write(data: Uint8Array): void {
        this.innerWriter.write(data);
    }

    close(): void {
        this.innerWriter.close();
        const data = this.memFs.results.get(this.filename);
        if (data) {
            triggerDownload(data, this.filename);
        }
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

export { BrowserFileSystem };
