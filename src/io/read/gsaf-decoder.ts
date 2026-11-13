/**
 * GSAF (animated Gaussian-splat container) decoder.
 *
 * Wraps the gsaf WebAssembly decoder vendored at static/lib/gsaf/ (see its VERSION file). Each
 * frame is decoded and written out as an in-memory binary PLY in the standard 3DGS layout, so
 * it loads through the same path as a PLY file and can be compared gaussian for gaussian with
 * the frame it was encoded from.
 */

// spherical-harmonic band 0 constant
const SH_C0 = 0.28209479177387814;

// the layout `gsaf decode` writes, with the same conversions back from its render-ready values
const PLY_PROPERTIES = [
    'x',
    'y',
    'z',
    'f_dc_0',
    'f_dc_1',
    'f_dc_2',
    'opacity',
    'scale_0',
    'scale_1',
    'scale_2',
    'rot_0',
    'rot_1',
    'rot_2',
    'rot_3'
];

// the parts of the decoder's embind api used here
type GsafFrameSlot = {
    splatCount: number;
    positionsPtr(): number;
    rotationsPtr(): number;
    scalesPtr(): number;
    colorsPtr(): number;
};

type WasmReader = {
    frameCount(): number;
    decodeFrameInto(i: number, slot: number): void;
    frameSlot(slot: number): GsafFrameSlot;
    delete(): void;
};

type GsafModule = {
    HEAPF32: Float32Array;
    WasmReader: { openFromBytes(bytes: Uint8Array): WasmReader | null };
    gsafLastError(): string;
};

// the emscripten MODULARIZE factory defined by static/lib/gsaf/gsaf-decoder.js
type GsafModuleFactory = (options: { locateFile: (path: string) => string }) => Promise<GsafModule>;

let modulePromise: Promise<GsafModule> | null = null;

// Lazily load the wasm module (singleton). The glue is a classic script, so it is injected as
// a script tag and its global createGsafModule factory pointed at the sibling .wasm.
const loadGsafModule = (): Promise<GsafModule> => {
    if (!modulePromise) {
        modulePromise = new Promise((resolve, reject) => {
            const w = window as unknown as { createGsafModule?: GsafModuleFactory };

            const instantiate = () => {
                if (typeof w.createGsafModule !== 'function') {
                    reject(new Error('gsaf-decoder.js loaded but createGsafModule is missing'));
                    return;
                }
                w.createGsafModule({
                    locateFile: (p: string) => new URL(`static/lib/gsaf/${p}`, document.baseURI).toString()
                }).then(resolve, reject);
            };

            if (w.createGsafModule) {
                instantiate();
                return;
            }

            const script = document.createElement('script');
            script.src = new URL('static/lib/gsaf/gsaf-decoder.js', document.baseURI).toString();
            script.onload = instantiate;
            script.onerror = () => reject(new Error('failed to load gsaf-decoder.js'));
            document.head.appendChild(script);
        });
    }
    return modulePromise;
};

// Write a decoded frame (positions, w-x-y-z rotations, linear scales, activated rgba) as a
// binary little-endian PLY.
const writePly = (
    n: number,
    positions: Float32Array,
    rotations: Float32Array,
    scales: Float32Array,
    colors: Float32Array
): ArrayBuffer => {
    const header = new TextEncoder().encode(
        [
            'ply',
            'format binary_little_endian 1.0',
            `element vertex ${n}`,
            ...PLY_PROPERTIES.map((name) => `property float ${name}`),
            'end_header',
            ''
        ].join('\n')
    );
    const buffer = new ArrayBuffer(header.length + n * PLY_PROPERTIES.length * 4);
    new Uint8Array(buffer).set(header);
    const view = new DataView(buffer);

    let offset = header.length;
    const put = (value: number) => {
        view.setFloat32(offset, value, true);
        offset += 4;
    };

    for (let i = 0; i < n; ++i) {
        put(positions[i * 3]);
        put(positions[i * 3 + 1]);
        put(positions[i * 3 + 2]);
        put((colors[i * 4] - 0.5) / SH_C0);
        put((colors[i * 4 + 1] - 0.5) / SH_C0);
        put((colors[i * 4 + 2] - 0.5) / SH_C0);
        // alpha clamped a hair off {0,1} so the logit stays finite, as gsaf's PLY writer does
        const a = Math.min(Math.max(colors[i * 4 + 3], 1e-7), 1 - 1e-7);
        put(Math.log(a / (1 - a)));
        put(Math.log(Math.max(scales[i * 3], 1e-9)));
        put(Math.log(Math.max(scales[i * 3 + 1], 1e-9)));
        put(Math.log(Math.max(scales[i * 3 + 2], 1e-9)));
        put(rotations[i * 4]);
        put(rotations[i * 4 + 1]);
        put(rotations[i * 4 + 2]);
        put(rotations[i * 4 + 3]);
    }

    return buffer;
};

/**
 * Random-access decoder over an in-memory GSAF file.
 */
class GsafReader {
    private module: GsafModule;

    // released by destroy()
    private reader: WasmReader;

    readonly frameCount: number;

    private constructor(module: GsafModule, reader: WasmReader) {
        this.module = module;
        this.reader = reader;
        this.frameCount = reader.frameCount();
    }

    /** Open a GSAF file from its bytes. Throws with the decoder's reason on failure. */
    static async open(bytes: Uint8Array): Promise<GsafReader> {
        const module = await loadGsafModule();
        const reader = module.WasmReader.openFromBytes(bytes);
        if (!reader) {
            throw new Error(module.gsafLastError());
        }
        return new GsafReader(module, reader);
    }

    /** Decode frame i (in any order: the decoder replays from a keyframe as needed) to a PLY. */
    decodeFramePly(i: number): ArrayBuffer {
        this.reader.decodeFrameInto(i, 0);
        const slot = this.reader.frameSlot(0);
        const n = slot.splatCount;
        // views made after the decode: a heap growth inside it replaces the buffer
        const heap = this.module.HEAPF32;
        const span = (ptr: number, k: number) => heap.subarray(ptr >> 2, (ptr >> 2) + n * k);
        return writePly(
            n,
            span(slot.positionsPtr(), 3),
            span(slot.rotationsPtr(), 4),
            span(slot.scalesPtr(), 3),
            span(slot.colorsPtr(), 4)
        );
    }

    destroy() {
        this.reader.delete();
    }
}

export { GsafReader };
