/**
 * Writer utilities for splat serialization.
 */

import type { Writer } from '@playcanvas/splat-transform';

/**
 * Compress the incoming stream with gzip.
 */
class GZipWriter implements Writer {
    write: (data: Uint8Array) => Promise<void>;
    close: () => Promise<void>;

    private cursor = 0;

    get bytesWritten(): number {
        return this.cursor;
    }

    constructor(writer: Writer) {
        const stream = new CompressionStream('gzip');
        const streamWriter = stream.writable.getWriter();
        const streamReader = stream.readable.getReader();

        // hook up the reader side of the compressed stream
        const reader = (async () => {
            while (true) {
                const { done, value } = await streamReader.read();
                if (done) break;
                await writer.write(value);
            }
        })();

        this.write = async (data: Uint8Array) => {
            this.cursor += data.byteLength;
            await streamWriter.ready;
            await streamWriter.write(data as unknown as ArrayBuffer);
        };

        this.close = async () => {
            // close the writer, we're done
            await streamWriter.close();

            // wait for the reader to finish sending data
            await reader;
        };
    }
}

/**
 * Wrapper that tracks write progress.
 */
class ProgressWriter implements Writer {
    write: (data: Uint8Array) => Promise<void>;
    close: () => void;

    private cursor = 0;

    get bytesWritten(): number {
        return this.cursor;
    }

    constructor(writer: Writer, totalBytes: number, progress?: (progress: number, total: number) => void) {
        this.write = async (data: Uint8Array) => {
            this.cursor += data.byteLength;
            await writer.write(data);
            progress?.(this.cursor, totalBytes);
        };

        this.close = () => {
            if (this.cursor !== totalBytes) {
                throw new Error(`ProgressWriter: expected ${totalBytes} bytes, but wrote ${this.cursor} bytes`);
            }
            progress?.(this.cursor, totalBytes);
        };
    }
}

export { GZipWriter, ProgressWriter };
