type PullFunc = (target?: Uint8Array) => Promise<Uint8Array | void>;
type SkipFunc = (bytes: number) => Promise<void>;

class ReadStream {
    readBytes: number;
    totalBytes: number
    pull: PullFunc;
    skip: SkipFunc;

    constructor(totalBytes: number, pull: PullFunc, skip: SkipFunc) {
        this.readBytes = 0;
        this.totalBytes = totalBytes;

        this.pull = async (target?: Uint8Array): Promise<Uint8Array | void> => {
            const result = await pull(target);
            this.readBytes += target?.byteLength ?? (result && result.byteLength) ?? 0;
            return result;
        };

        this.skip = async (bytes: number): Promise<void> => {
            await skip(bytes);
            this.readBytes += bytes;
        };
    }
};

const wrapReadableStream = (contentLength: number, reader: ReadableStreamDefaultReader<Uint8Array>): ReadStream => {
    const incoming: Uint8Array[] = [];
    let incomingBytes = 0;

    const pull = async (target?: Uint8Array): Promise<Uint8Array | void> => {
        // read the entire rest of the stream and return it
        if (!target) {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                incoming.push(value);
                incomingBytes += value.byteLength;
            }

            // concatenate incoming chunks
            const result = new Uint8Array(incomingBytes);
            let offset = 0;
            for (const chunk of incoming) {
                result.set(chunk, offset);
                offset += chunk.byteLength;
            }
            return result;
        }

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

    // FIXME: inefficient skip implementation
    const skip = async (bytes: number): Promise<void> => {
        const tmp = new Uint8Array(bytes);
        await pull(tmp);
    };

    return new ReadStream(contentLength, pull, skip);
};

const createReadStream = async (source: ArrayBuffer | Blob | Response | Request | string): Promise<ReadStream> => {
    if (source instanceof ArrayBuffer) {
        
    } else if (source instanceof Blob) {

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
};

export { ReadStream, createReadStream };
