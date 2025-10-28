type AssetSourceType = ArrayBuffer | Blob | Response | Request | string;
type PullFunc = (target: Uint8Array) => Promise<void>;

class ReadStream {
    readBytes: number;
    totalBytes: number
    pull: PullFunc;

    constructor(totalBytes: number, pull: PullFunc) {
        this.readBytes = 0;
        this.totalBytes = totalBytes;

        this.pull = async (target: Uint8Array): Promise<void> => {
            const result = await pull(target);
            this.readBytes += target.byteLength;
            return result;
        };
    }
};

const wrapReadableStream = (contentLength: number, reader: ReadableStreamDefaultReader<Uint8Array>): ReadStream => {
    const incoming: Uint8Array[] = [];
    let incomingBytes = 0;

    const pull = async (target: Uint8Array): Promise<void> => {
        // read the next result.byteLength bytes into result
        while (incomingBytes < target.byteLength) {
            const { done, value } = await reader.read();
            if (done) {
                throw new Error('Unexpected end of stream');
            }
            incoming.push(value);
            incomingBytes += value.byteLength;
        }

        // copy data into result
        let offset = 0;
        while (offset < target.byteLength) {
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
    };

    return new ReadStream(contentLength, pull);
}

class AssetSource {
    source: AssetSourceType;

    constructor(source: AssetSourceType) {
        this.source = source;
    }

    async getReadStream(): Promise<ReadStream> {
        const { source } = this;

        if (source instanceof ArrayBuffer) {
            
        } else if (source instanceof Blob) {
            // TODO
        } else {
            const response = (source instanceof Response) ?
                source :
                    await fetch((source instanceof Request) ? source : new Request(source));

            if (!response.ok) {
                throw new Error(`Failed to fetch asset: ${response.status} ${response.statusText}`);
            }

            if (!response.body) {
                throw new Error(`Response has no body`);
            }

            const contentLength = response.headers.get('Content-Length');
            const reader = response.body.getReader();

            return wrapReadableStream(contentLength ? parseInt(contentLength, 10) : 0, reader);
        }
    }

    async arrayBuffer(): Promise<ArrayBuffer> {
        const { source } = this;

        if (source instanceof ArrayBuffer) {
            return source;
        } else if (source instanceof Blob) {
            return await source.arrayBuffer();
        } else {
            const response = (source instanceof Response) ?
                source :
                    await fetch((source instanceof Request) ? source : new Request(source));

            if (!response.ok) {
                throw new Error(`Failed to fetch asset: ${response.status} ${response.statusText}`);
            }

            return await response.arrayBuffer();
        }
    }
};

export { ReadStream, AssetSource };
