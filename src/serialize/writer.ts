// defines the interface for a stream writer class. all functions are async.
interface Writer {
    // write data to the stream. if finalWrite is true then `data` may be stored directly.
    write(data: Uint8Array, finalWrite?: boolean): void;

    // close the writing stream. return value depends on writer implementation.
    close(): any;
}

// write data to a file stream
class FileStreamWriter implements Writer {
    write: (data: Uint8Array, finalWrite?: boolean) => void;
    close: () => void;

    constructor(stream: FileSystemWritableFileStream) {
        let cursor = 0;

        stream.seek(0);

        this.write = async (data: Uint8Array, finalWrite?: boolean) => {
            cursor += data.byteLength;
            await stream.write(data);
        };

        this.close = async () => {
            await stream.truncate(cursor);
            await stream.close();
        };
    }
}

// write data to a memory buffer
class BufferWriter implements Writer {
    write: (data: Uint8Array, finalWrite?: boolean) => void;
    close: () => Uint8Array;

    constructor() {
        let buffer: Uint8Array;
        let cursor = 0;

        this.write = (data: Uint8Array, finalWrite?: boolean) => {
            if (!buffer) {
                buffer = finalWrite ? data : data.slice();
                cursor = data.byteLength;
            } else {
                if (buffer.byteLength < cursor + data.byteLength) {
                    let newSize = buffer.byteLength * 2;
                    while (newSize < cursor + data.byteLength) {
                        newSize *= 2;
                    }
                    const newData = new Uint8Array(newSize);
                    newData.set(buffer);
                    buffer = newData;
                }
                buffer.set(data, cursor);
                cursor += data.byteLength;
            }
        };

        this.close = () => {
            return cursor === buffer.buffer.byteLength ? buffer : new Uint8Array(buffer.buffer, 0, cursor);
        };
    }
}

// write to a memory download buffer and trigger a browser download when closed
class DownloadWriter implements Writer {
    write: (data: Uint8Array, finalWrite?: boolean) => void;
    close: () => void;

    constructor(filename: string) {
        const bufferWriter = new BufferWriter();

        this.write = (data: Uint8Array, finalWrite?: boolean) => {
            bufferWriter.write(data, finalWrite);
        };

        this.close = () => {
            const buffer = bufferWriter.close();

            // download file to client
            const blob = new Blob([buffer], { type: 'octet/stream' });
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
    }
}

// compresses the stream with gzip
class GZipWriter implements Writer {
    write: (data: Uint8Array, finalWrite?: boolean) => void;
    close: () => void;

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

        this.write = async (data: Uint8Array, finalWrite?: boolean) => {
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

export { Writer, FileStreamWriter, BufferWriter, DownloadWriter, GZipWriter };
