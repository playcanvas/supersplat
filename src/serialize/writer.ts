// defines the interface for a stream writer class. all functions are async.
interface Writer {
    // write data to the stream. if finalWrite is true then `data` may be stored directly.
    write(data: Uint8Array, finalWrite?: boolean): void;

    // close the writing stream
    close(): void;
};

// write data to a file stream
class FileStreamWriter implements Writer {
    private stream: FileSystemWritableFileStream;
    private cursor = 0;

    constructor(stream: FileSystemWritableFileStream) {
        this.stream = stream;
        this.cursor = 0;

        stream.seek(0);
    }

    async write(data: Uint8Array, finalWrite?: boolean) {
        this.cursor += data.byteLength;
        await this.stream.write(data);
    };

    async close() {
        await this.stream.truncate(this.cursor);
        await this.stream.close();
    };
};

// write data to a memory buffer
class BufferWriter implements Writer {
    private _buffer: Uint8Array;
    private cursor = 0;

    write(data: Uint8Array, finalWrite?: boolean) {
        if (!this._buffer) {
            this._buffer = finalWrite ? data : data.slice();
            this.cursor = data.byteLength;
        } else {
            if (this._buffer.byteLength < this.cursor + data.byteLength) {
                let newSize = this._buffer.byteLength * 2;
                while (newSize < this.cursor + data.byteLength) {
                    newSize *= 2;
                }
                const newData = new Uint8Array(newSize);
                newData.set(this._buffer);
                this._buffer = newData;
            }
            this._buffer.set(data, this.cursor);
            this.cursor += data.byteLength;
        }
    };

    close() {
        // no-op
    }

    get buffer() {
        return this.cursor === this._buffer.buffer.byteLength ? this._buffer : new Uint8Array(this._buffer.buffer, 0, this.cursor);
    }
};

// write to a memory download buffer and trigger a browser download when closed
class DownloadWriter extends BufferWriter {
    private filename: string;

    constructor(filename: string) {
        super();

        this.filename = filename;
    }

    close() {
        super.close();

        // download file to client
        const blob = new Blob([this.buffer], { type: 'octet/stream' });
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
    };
};

export { Writer, FileStreamWriter, BufferWriter, DownloadWriter };
