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

    constructor(writer: Writer, totalBytes: number, progress?: (progress: number, total: number) => void) {
        let cursor = 0;

        this.write = async (data: Uint8Array) => {
            cursor += data.byteLength;
            await writer.write(data);
            progress?.(cursor, totalBytes);
        };

        this.close = () => {
            if (cursor !== totalBytes) {
                throw new Error(`ProgressWriter: expected ${totalBytes} bytes, but wrote ${cursor} bytes`);
            }
            progress?.(cursor, totalBytes);
        };
    }
}

export { GZipWriter, ProgressWriter };
