/**
 * GSAF (Gaussian Splatting Animation Format) decoder.
 *
 * Wraps the gsaf WebAssembly decoder (vendored at static/lib/gsaf/) which decodes
 * each frame to a full, absolute splat set (Draco keyframes/births + zstd delta
 * streams are handled inside the wasm). Each decoded frame is converted to a
 * GSplatData with the standard 3DGS PLY property layout so the rest of the app
 * (Splat element, sorting, rendering, serialize/export) treats it like any splat.
 */

import { GSplatData } from 'playcanvas';

// spherical-harmonic DC band 0 constant (matches editor.ts decodeColorChannel)
const SH_C0 = 0.28209479177387814;

// clamp used to keep ln()/logit() finite at the extremes
const EPS = 1e-6;

// the emscripten MODULARIZE factory exported by static/lib/gsaf/gsaf.js
let modulePromise: Promise<any> | null = null;

/**
 * Lazily load the gsaf wasm module (singleton). The vendored gsaf.js is a UMD/
 * classic-script Emscripten build, so it is injected as a script tag (matching
 * the gsaf-inspector) and its global `createGsafModule` factory is invoked with a
 * locateFile that points at the sibling gsaf.wasm.
 */
const loadGsafModule = (): Promise<any> => {
    if (!modulePromise) {
        modulePromise = new Promise((resolve, reject) => {
            const w = window as any;

            const instantiate = () => {
                const factory = w.createGsafModule;
                if (typeof factory !== 'function') {
                    reject(new Error('gsaf.js loaded but createGsafModule is missing'));
                    return;
                }
                factory({
                    locateFile: (p: string) => new URL(`static/lib/gsaf/${p}`, document.baseURI).toString()
                }).then(resolve, reject);
            };

            if (w.createGsafModule) {
                instantiate();
                return;
            }

            const script = document.createElement('script');
            script.src = new URL('static/lib/gsaf/gsaf.js', document.baseURI).toString();
            script.onload = instantiate;
            script.onerror = () => reject(new Error('failed to load gsaf.js'));
            document.head.appendChild(script);
        });
    }
    return modulePromise;
};

/**
 * Build GSplatData (3DGS PLY layout) from a decoded frame's flat float arrays.
 * decodeFrame returns linearized runtime values (world-space scale, linear RGB,
 * alpha in [0,1], quaternion [w,x,y,z]); we apply the inverse GS transforms so
 * the result is identical to a loaded 3DGS .ply.
 */
const buildGSplatData = (
    n: number,
    positions: Float32Array,
    rotations: Float32Array,
    scales: Float32Array,
    colors: Float32Array
): GSplatData => {
    const x = new Float32Array(n);
    const y = new Float32Array(n);
    const z = new Float32Array(n);
    const scale0 = new Float32Array(n);
    const scale1 = new Float32Array(n);
    const scale2 = new Float32Array(n);
    const rot0 = new Float32Array(n);
    const rot1 = new Float32Array(n);
    const rot2 = new Float32Array(n);
    const rot3 = new Float32Array(n);
    const fdc0 = new Float32Array(n);
    const fdc1 = new Float32Array(n);
    const fdc2 = new Float32Array(n);
    const opacity = new Float32Array(n);

    for (let i = 0; i < n; ++i) {
        x[i] = positions[i * 3 + 0];
        y[i] = positions[i * 3 + 1];
        z[i] = positions[i * 3 + 2];

        // rotations are [w,x,y,z] -> rot_0..3 (3DGS PLY order)
        rot0[i] = rotations[i * 4 + 0];
        rot1[i] = rotations[i * 4 + 1];
        rot2[i] = rotations[i * 4 + 2];
        rot3[i] = rotations[i * 4 + 3];

        // world-space (linear) scale -> log scale
        scale0[i] = Math.log(Math.max(scales[i * 3 + 0], EPS));
        scale1[i] = Math.log(Math.max(scales[i * 3 + 1], EPS));
        scale2[i] = Math.log(Math.max(scales[i * 3 + 2], EPS));

        // linear rgb -> SH DC coefficient
        fdc0[i] = (colors[i * 4 + 0] - 0.5) / SH_C0;
        fdc1[i] = (colors[i * 4 + 1] - 0.5) / SH_C0;
        fdc2[i] = (colors[i * 4 + 2] - 0.5) / SH_C0;

        // alpha [0,1] -> logit opacity
        const a = Math.min(1 - EPS, Math.max(EPS, colors[i * 4 + 3]));
        opacity[i] = Math.log(a / (1 - a));
    }

    const prop = (name: string, storage: Float32Array) => ({
        type: 'float',
        name,
        storage,
        byteSize: 4
    });

    return new GSplatData([{
        name: 'vertex',
        count: n,
        properties: [
            prop('x', x), prop('y', y), prop('z', z),
            prop('f_dc_0', fdc0), prop('f_dc_1', fdc1), prop('f_dc_2', fdc2),
            prop('opacity', opacity),
            prop('scale_0', scale0), prop('scale_1', scale1), prop('scale_2', scale2),
            prop('rot_0', rot0), prop('rot_1', rot1), prop('rot_2', rot2), prop('rot_3', rot3)
        ]
    }]);
};

/**
 * Random-access decoder over an in-memory GSAF buffer.
 */
class GsafReader {
    private module: any;
    private reader: any;   // Module.WasmReader (embind object; must be .delete()d)
    readonly frameCount: number;

    private constructor(module: any, reader: any) {
        this.module = module;
        this.reader = reader;
        this.frameCount = reader.frameCount();
    }

    /** Open a GSAF file from its bytes. Throws with the decoder reason on failure. */
    static async open(bytes: Uint8Array): Promise<GsafReader> {
        const module = await loadGsafModule();
        const reader = module.WasmReader.openFromBytes(bytes);
        if (!reader) {
            throw new Error(module.gsafLastError());
        }
        return new GsafReader(module, reader);
    }

    /** Splat count of frame i (pre-decode, for sizing). */
    splatsInFrame(i: number): number {
        return this.reader.splatsInFrame(i);
    }

    /** Decode frame i to GSplatData (3DGS PLY layout). */
    decodeToGSplatData(i: number): GSplatData {
        const frame = this.reader.decodeFrame(i);
        try {
            const n = frame.splatCount;
            const buffer = this.module.HEAPF32.buffer;

            // views over wasm linear memory; build the GSplatData from them before
            // delete() frees the frame (the heap can also move on later allocation)
            const positions = new Float32Array(buffer, frame.positionsPtr(), n * 3);
            const rotations = new Float32Array(buffer, frame.rotationsPtr(), n * 4);
            const scales = new Float32Array(buffer, frame.scalesPtr(), n * 3);
            const colors = new Float32Array(buffer, frame.colorsPtr(), n * 4);

            return buildGSplatData(n, positions, rotations, scales, colors);
        } finally {
            frame.delete();
        }
    }

    destroy() {
        this.reader?.delete();
        this.reader = null;
    }
}

export { loadGsafModule, GsafReader };
