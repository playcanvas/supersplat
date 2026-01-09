/**
 * WebP encoder using libwebp WASM for true lossless encoding.
 */

// Module instance cache
let webpModule: WebPModule | null = null;
let modulePromise: Promise<WebPModule> | null = null;

interface WebPModule {
    _malloc: (size: number) => number;
    _free: (ptr: number) => void;
    _webp_encode_lossless_rgba: (
        rgba: number,
        width: number,
        height: number,
        stride: number,
        outPtrPtr: number,
        outSizePtr: number
    ) => number;
    _webp_free: (ptr: number) => void;
    HEAPU8: Uint8Array;
    HEAPU32: Uint32Array;
}

/**
 * Initialize the WebP WASM module.
 */
const initWebPModule = async (): Promise<WebPModule> => {
    if (webpModule) {
        return webpModule;
    }

    if (modulePromise) {
        return modulePromise;
    }

    modulePromise = (async () => {
        const urlBase = new URL('static/lib/webp', document.baseURI).toString();

        // Dynamic import of the WASM module
        const createModule = (await import(/** @vite-ignore */ `${urlBase}/webp.mjs`)).default;

        webpModule = await createModule({
            locateFile: (path: string) => {
                if (path.endsWith('.wasm')) {
                    return `${urlBase}/webp.wasm`;
                }
                return path;
            }
        }) as WebPModule;

        return webpModule;
    })();

    return await modulePromise;
};

/**
 * Encode RGBA pixel data to lossless WebP format.
 *
 * @param rgba - RGBA pixel data (4 bytes per pixel)
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @returns WebP encoded data as Uint8Array
 */
const encodeWebP = async (rgba: Uint8Array, width: number, height: number): Promise<Uint8Array> => {
    const Module = await initWebPModule();

    const stride = width * 4;
    const inPtr = Module._malloc(rgba.length);
    const outPtrPtr = Module._malloc(4);
    const outSizePtr = Module._malloc(4);

    try {
        Module.HEAPU8.set(rgba, inPtr);

        const ok = Module._webp_encode_lossless_rgba(inPtr, width, height, stride, outPtrPtr, outSizePtr);
        if (!ok) {
            throw new Error('WebP lossless encode failed');
        }

        const outPtr = Module.HEAPU32[outPtrPtr >> 2];
        const outSize = Module.HEAPU32[outSizePtr >> 2];
        const result = Module.HEAPU8.slice(outPtr, outPtr + outSize);

        Module._webp_free(outPtr);

        return result;
    } finally {
        Module._free(inPtr);
        Module._free(outPtrPtr);
        Module._free(outSizePtr);
    }
};

export { encodeWebP };
