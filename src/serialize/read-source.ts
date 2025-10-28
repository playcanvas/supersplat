type ReadSourceType = ArrayBuffer | Blob | Response | Request | string;
type PullFunc = (target: Uint8Array) => Promise<number>;

class ReadStream {
    readBytes: number;
    totalBytes: number;
    pull: PullFunc;

    constructor(totalBytes: number, pull: PullFunc) {
        this.readBytes = 0;
        this.totalBytes = totalBytes;

        this.pull = async (target: Uint8Array): Promise<number> => {
            const result = await pull(target);
            this.readBytes += result;
            return result;
        };
    }
}

const wrapReadableStream = (contentLength: number, stream: ReadableStream<Uint8Array>): ReadStream => {
    const incoming: Uint8Array[] = [];
    let incomingBytes = 0;

    const reader = stream.getReader();

    const pull = async (target: Uint8Array): Promise<number> => {
        // read the next result.byteLength bytes into result
        while (incomingBytes < target.byteLength) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            incoming.push(value);
            incomingBytes += value.byteLength;
        }

        // copy data into result
        let offset = 0;
        while (offset < target.byteLength && incoming.length > 0) {
            const chunk = incoming[0];
            const copyBytes = Math.min(chunk.byteLength, target.byteLength - offset);
            target.set(chunk.subarray(0, copyBytes), offset);
            offset += copyBytes;
            incomingBytes -= copyBytes;

            if (copyBytes < chunk.byteLength) {
                // remove copied bytes from chunk
                incoming[0] = chunk.subarray(copyBytes);
            } else {
                // remove chunk
                incoming.shift();
            }
        }

        return offset;
    };

    return new ReadStream(contentLength, pull);
};

const createArrayBufferStream = (buffer: ArrayBuffer): ReadableStream<Uint8Array> => {
    const chunkSize = 65536;
    let cursor = 0;
    return new ReadableStream({
        pull(controller) {
            if (cursor < buffer.byteLength) {
                const end = Math.min(cursor + chunkSize, buffer.byteLength);
                const chunk = new Uint8Array(buffer, cursor, end - cursor);
                controller.enqueue(chunk);
                cursor = end;
            } else {
                controller.close();
            }
        }
    });
};

class ReadSource {
    source: ReadSourceType;

    constructor(source: ReadSourceType) {
        this.source = source;
    }

    async getReadStream(): Promise<ReadStream> {
        const { source } = this;

        if (source instanceof ArrayBuffer) {
            return wrapReadableStream(source.byteLength, createArrayBufferStream(source));
        } else if (source instanceof Blob) {
            return wrapReadableStream(source.size, source.stream());
        }
        const response = (source instanceof Response) ?
            source :
            await fetch((source instanceof Request) ? source : new Request(source));

        if (!response.ok) {
            throw new Error(`Failed to fetch asset: ${response.status} ${response.statusText}`);
        }

        if (!response.body) {
            throw new Error('Response has no body');
        }

        const contentLength = response.headers.get('Content-Length');

        return wrapReadableStream(contentLength ? parseInt(contentLength, 10) : 0, response.body);

    }

    async arrayBuffer(): Promise<ArrayBuffer> {
        const { source } = this;

        if (source instanceof ArrayBuffer) {
            return source;
        } else if (source instanceof Blob) {
            return await source.arrayBuffer();
        }
        const response = (source instanceof Response) ?
            source :
            await fetch((source instanceof Request) ? source : new Request(source));

        if (!response.ok) {
            throw new Error(`Failed to fetch asset: ${response.status} ${response.statusText}`);
        }

        return await response.arrayBuffer();

    }
}

export { ReadStream, ReadSource };
