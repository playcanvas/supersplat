// defines the interface for a stream writer class. all functions are async.
interface Writer {
    // write data to the stream
    write(data: Uint8Array): void | Promise<void>;

    // close the writing stream. return value depends on writer implementation.
    close(): any | Promise<any>;
}

// write data to a file stream
class FileStreamWriter implements Writer {
    write: (data: Uint8Array) => void;
    close: () => void;

    constructor(stream: FileSystemWritableFileStream) {
        let cursor = 0;

        stream.seek(0);

        this.write = async (data: Uint8Array) => {
            cursor += data.byteLength;
            await stream.write(data);
        };

        this.close = async () => {
            await stream.truncate(cursor);
            await stream.close();
            return true;
        };
    }
}

// write data to a memory buffer
class BufferWriter implements Writer {
    write: (data: Uint8Array) => void;
    close: () => Uint8Array[];

    constructor() {
        const buffers: Uint8Array[] = [];
        let buffer: Uint8Array;
        let cursor = 0;

        this.write = (data: Uint8Array) => {
            let readcursor = 0;

            while (readcursor < data.byteLength) {
                const readSize = data.byteLength - readcursor;

                // allocate buffer
                if (!buffer) {
                    buffer = new Uint8Array(Math.max(5 * 1024 * 1024, readSize));
                }

                const writeSize = buffer.byteLength - cursor;
                const copySize = Math.min(readSize, writeSize);

                buffer.set(data.subarray(readcursor, readcursor + copySize), cursor);

                readcursor += copySize;
                cursor += copySize;

                if (cursor === buffer.byteLength) {
                    buffers.push(buffer);
                    buffer = null;
                    cursor = 0;
                }
            }
        };

        this.close = () => {
            if (buffer) {
                buffers.push(new Uint8Array(buffer.buffer, 0, cursor));
                buffer = null;
                cursor = 0;
            }
            return buffers;
        };
    }
}

// write to a memory download buffer and trigger a browser download when closed
class DownloadWriter implements Writer {
    write: (data: Uint8Array) => void;
    close: () => void;

    constructor(filename: string) {
        const bufferWriter = new BufferWriter();

        this.write = (data: Uint8Array) => {
            bufferWriter.write(data);
        };

        this.close = () => {
            const buffers = bufferWriter.close();

            // download file to client
            const blob = new Blob(buffers, { type: 'octet/stream' });
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

            return true;
        };
    }
}

// compress the incoming stream with gzip
class GZipWriter implements Writer {
    write: (data: Uint8Array) => void;
    close: () => any | Promise<any>;

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
            await streamWriter.write(data);
        };

        this.close = async () => {
            // close the writer, we're done
            await streamWriter.close();

            // wait for the reader to finish sending data
            await reader;
        };
    }
}

class ProgressWriter implements Writer {
    write: (data: Uint8Array) => void;
    close: () => any;

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
            return totalBytes;
        };
    }
}

export { Writer, FileStreamWriter, BufferWriter, DownloadWriter, GZipWriter, ProgressWriter };
