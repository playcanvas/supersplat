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
    abort: () => Promise<void>;

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
            try {
                while (true) {
                    const { done, value } = await streamReader.read();
                    if (done) break;
                    await writer.write(value);
                }
            } catch (err) {
                // fail the write side with the sink's error: with nothing draining
                // the compressed stream, writes would otherwise stall on
                // backpressure and the error would only surface as an unhandled
                // rejection
                await streamWriter.abort(err);
                // aborting an already-closed writable resolves, so the error must
                // be rethrown or a sink failure on the final chunk would be lost
                throw err;
            }
        })();

        // close() awaits reader and surfaces its error; this handler only keeps
        // the rejection from being reported as unhandled when the caller aborts
        // instead of closing
        reader.catch(() => {});

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

        this.abort = async () => {
            try {
                await streamWriter.abort();
            } catch {
                // already failing — ignore
            }
            try {
                await writer.abort();
            } catch {
                // already failing — ignore
            }
        };
    }
}

/**
 * Wrapper that tracks write progress.
 */
class ProgressWriter implements Writer {
    write: (data: Uint8Array) => Promise<void>;
    close: () => void;
    abort: () => Promise<void>;

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

        this.abort = async () => {
            try {
                await writer.abort();
            } catch {
                // already failing — ignore
            }
        };
    }
}

export { GZipWriter, ProgressWriter };
