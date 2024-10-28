const WORKER_STR = function (urlBase: string) {
    const initLodepng = () => {
        return new Promise((resolve) => {
            (self as any).importScripts(`${urlBase}/lodepng.js`);
            resolve((self as any).lodepng({
                locateFile: () => `${urlBase}/lodepng.wasm`
            }));
        });
    };

    const compress = (lodepng: any, pixels: any[], width: number, height: number): Uint8Array => {
        const resultDataPtrPtr = lodepng._malloc(4);
        const resultSizePtr = lodepng._malloc(4);
        const imageData = lodepng._malloc(width * height * 4);

        // copy pixels into wasm memory
        for (let y = 0; y < height; ++y) {
            let soff = y * width;
            let doff = imageData / 4 + (height - 1 - y) * width;
            for (let x = 0; x < width; ++x) {
                lodepng.HEAPU32[doff++] = pixels[soff++];
            }
        }

        // invoke compress
        lodepng._lodepng_encode32(resultDataPtrPtr, resultSizePtr, imageData, width, height);

        // read results
        const result = lodepng.HEAPU8.slice(lodepng.HEAPU32[resultDataPtrPtr / 4], lodepng.HEAPU32[resultDataPtrPtr / 4] + lodepng.HEAPU32[resultSizePtr / 4]);

        lodepng._free(resultDataPtrPtr);
        lodepng._free(resultSizePtr);
        lodepng._free(imageData);

        return result;
    };

    initLodepng()
    .then((lodepng) => {
        self.onmessage = (message) => {
            const { data } = message;
            const { token, pixels, width, height } = data;

            // compress
            const result = compress(lodepng, pixels, width, height);

            // send result
            self.postMessage({ token, result }, undefined, [result.buffer]);
        };

        self.postMessage('ready');
    });
}.toString();

class ExternalPromise {
    resolver: (value?: any) => void;
    promise: Promise<any>;

    constructor() {
        this.promise = new Promise((resolve) => {
            this.resolver = resolve;
        });
    }
}

class PngCompressor {
    compress: (pixels: Uint32Array, width: number, height: number) => Promise<ArrayBuffer>;

    constructor() {
        const urlBase = new URL('/static/lib/lodepng', document.baseURI);
        const workerBlob = new Blob([`(${WORKER_STR})('${urlBase}')\n\n`], {
            type: 'application/javascript'
        });
        const worker = new Worker(URL.createObjectURL(workerBlob));
        const workerReady = new ExternalPromise();
        const results = new Map<number, (result: ArrayBuffer)=>void>();
        let token = 1;

        worker.addEventListener('message', (message) => {
            if (message.data === 'ready') {
                workerReady.resolver();
            } else {
                const { token, result } = message.data;
                results.get(token)(result);
                results.delete(token);
            }
        });

        this.compress = async (pixels: Uint32Array, width: number, height: number) => {
            // ensure worker is ready
            await workerReady.promise;

            // create result promise instance
            const resultReady = new ExternalPromise();
            results.set(token, resultReady.resolver);

            // compress
            worker.postMessage({ token, pixels, width, height }, [pixels.buffer]);

            token++;

            return await resultReady.promise;
        };
    }
}

export { PngCompressor };
