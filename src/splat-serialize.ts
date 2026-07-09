import {
    createChunkDataPool,
    logger as splatTransformLogger,
    MemoryFileSystem,
    Transform,
    writeSource,
    ZipFileSystem,
    type ChunkData,
    type ChunkDataPool,
    type ChunkLayer,
    type ChunkSource,
    type ChunkSourceMetadata,
    type FileSystem,
    type LayerLayout,
    type LogEvent,
    type Options,
    type OutputFormat,
    type ReadRequest,
    type Renderer,
    type SHBands,
    type Writer
} from '@playcanvas/splat-transform';
import {
    GSplatData,
    Mat3,
    Mat4,
    PIXELFORMAT_BGRA8,
    Quat,
    Texture,
    Vec3,
    WebgpuGraphicsDevice
} from 'playcanvas';

import { version } from '../package.json';
import { ColorGrade, dcDecode, dcEncode, sigmoid } from './color-grade';
import { Events } from './events';
import { SHRotation } from './sh-utils';
import { Splat } from './splat';
import { State } from './splat-state';

type SerializeSettings = {
    maxSHBands?: number;            // specifies the maximum number of bands to be exported
    selected?: boolean;             // only export selected gaussians. used for copy/paste
    minOpacity?: number;            // filter out gaussians with alpha less than or equal to minAlpha
    removeInvalid?: boolean;        // filter out gaussians with invalid data (NaN/Infinity)

    // the following options are used when serializing for document save.
    // keepWorldTransform/keepColorTint flow through to SingleSplat; keepStateData
    // is accepted for compatibility but the streaming writers never export state.
    keepStateData?: boolean;        // keep the state data array
    keepWorldTransform?: boolean;   // don't apply the world transform when resolving splat transforms
    keepColorTint?: boolean;        // refrain from applying color tints
};

type AnimTrack = {
    name: string,
    duration: number,
    frameRate: number,
    loopMode: 'none' | 'repeat' | 'pingpong',
    interpolation: 'step' | 'spline',
    smoothness: number,
    keyframes: {
        times: number[],
        values: {
            position: number[],
            target: number[],
            fov: number[],
        }
    }
};

type CameraPose = {
    position: [number, number, number],
    target: [number, number, number],
    fov: number
};

type Camera = {
    initial: CameraPose,
};

type Annotation = {
    position: [number, number, number],
    title: string,
    text: string,
    extras: any,
    camera: Camera
};

type PostEffectSettings = {
    sharpness: {
        enabled: boolean,
        amount: number,
    },
    bloom: {
        enabled: boolean,
        intensity: number,
        blurLevel: number,
    },
    grading: {
        enabled: boolean,
        brightness: number,
        contrast: number,
        saturation: number,
        tint: [number, number, number],
    },
    vignette: {
        enabled: boolean,
        intensity: number,
        inner: number,
        outer: number,
        curvature: number,
    },
    fringing: {
        enabled: boolean,
        intensity: number
    }
};

const defaultPostEffectSettings: PostEffectSettings = {
    sharpness: { enabled: false, amount: 0 },
    bloom: { enabled: false, intensity: 1, blurLevel: 2 },
    grading: { enabled: false, brightness: 1, contrast: 1, saturation: 1, tint: [1, 1, 1] },
    vignette: { enabled: false, intensity: 0.5, inner: 0.3, outer: 0.75, curvature: 1 },
    fringing: { enabled: false, intensity: 0.5 }
};

type ExperienceSettings = {
    version: 2,
    tonemapping: 'none' | 'linear' | 'filmic' | 'hejl' | 'aces' | 'aces2' | 'neutral',
    highPrecisionRendering: boolean,
    soundUrl?: string,
    background: {
        color: [number, number, number],
        skyboxUrl?: string
    },
    postEffectSettings: PostEffectSettings,
    animTracks: AnimTrack[],
    cameras: Camera[],
    annotations: Annotation[],
    startMode: 'default' | 'animTrack' | 'annotation'
};

type ViewerExportSettings = {
    type: 'html' | 'zip';
    experienceSettings: ExperienceSettings;
    events?: Events;
};

type ProgressFunc = (loaded: number, total: number) => void;

// create a filter for gaussians
class GaussianFilter {
    set: (splat: Splat) => void;
    test: (i: number) => boolean;

    constructor(serializeSettings: SerializeSettings) {
        let splat: Splat = null;
        let state: Uint8Array = null;
        let opacity: Float32Array = null;

        this.set = (s: Splat) => {
            splat = s;
            state = splat.splatData.getProp('state') as Uint8Array;
            opacity = splat.splatData.getProp('opacity') as Float32Array;
        };

        const onlySelected = serializeSettings.selected ?? false;
        const minOpacity = serializeSettings.minOpacity ?? 0;
        const removeInvalid = serializeSettings.removeInvalid ?? false;

        // properties where +Infinity and -Infinity are valid values
        const infOk = new Set(['opacity']);
        // properties where -Infinity is a valid value
        const negInfOk = new Set(['scale_0', 'scale_1', 'scale_2']);

        this.test = (i: number) => {
            // splat is deleted, always removed
            if ((state[i] & State.deleted) !== 0) {
                return false;
            }

            // optionally filter out unselected gaussians
            if (onlySelected && (state[i] !== State.selected)) {
                return false;
            }

            // optionally filter based on opacity
            if (minOpacity > 0 && sigmoid(opacity[i]) < minOpacity) {
                return false;
            }

            if (removeInvalid) {
                const { splatData } = splat;

                // check if any property of the gaussian is NaN/Infinity
                const element = splatData.getElement('vertex');
                for (let k = 0; k < element.properties.length; ++k) {
                    const prop = element.properties[k];
                    const { storage, name } = prop;
                    if (storage && !Number.isFinite(storage[i])) {
                        if (storage[i] === -Infinity && (infOk.has(name) || negInfOk.has(name))) continue;
                        if (storage[i] === Infinity && infOk.has(name)) continue;
                        return false;
                    }
                }
            }

            return true;
        };
    }
}

// count the total number of gaussians given a filter
const countGaussians = (splats: Splat[], filter: GaussianFilter) => {
    return splats.reduce((accum, splat) => {
        filter.set(splat);
        for (let i = 0; i < splat.splatData.numSplats; ++i) {
            accum += filter.test(i) ? 1 : 0;
        }
        return accum;
    }, 0);
};

const getVertexProperties = (splatData: GSplatData) => {
    return new Set<string>(
        splatData.getElement('vertex')
        .properties.filter((p: any) => p.storage)
        .map((p: any) => p.name)
    );
};

const getCommonPropNames = (splats: Splat[]) => {
    let result: Set<string>;

    for (let i = 0; i < splats.length; ++i) {
        const props = getVertexProperties(splats[i].splatData);
        result = i === 0 ? props : new Set([...result].filter(i => props.has(i)));
    }

    return [...result];
};

const shNames = new Array(45).fill('').map((_, i) => `f_rest_${i}`);
const shBandCoeffs = [0, 3, 8, 15];

// determine the number of sh bands present given an object with 'f_rest_*' properties
const calcSHBands = (data: Set<string>) => {
    return { '9': 1, '24': 2, '-1': 3 }[shNames.findIndex(v => !data.has(v))] ?? 0;
};

const v = new Vec3();
const q = new Quat();

// calculate splat transforms on demand and cache the result for next time
class SplatTransformCache {
    getMat: (index: number) => Mat4;
    getRot: (index: number) => Quat;
    getScale: (index: number) => Vec3;
    getSHRot: (index: number) => SHRotation;

    constructor(splat: Splat, keepWorldTransform = false) {
        const transforms = new Map<number, { transformIndex: number, mat: Mat4, rot: Quat, scale: Vec3, shRot: SHRotation }>();
        const indices = splat.transformTexture.getSource() as unknown as Uint32Array;
        const tmpMat = new Mat4();
        const tmpMat3 = new Mat3();
        const tmpQuat = new Quat();

        const getTransform = (index: number) => {
            const transformIndex = indices?.[index] ?? 0;
            let result = transforms.get(transformIndex);
            if (!result) {
                result = { transformIndex, mat: null, rot: null, scale: null, shRot: null };
                transforms.set(transformIndex, result);
            }
            return result;
        };

        this.getMat = (index: number) => {
            const transform = getTransform(index);

            if (!transform.mat) {
                const mat = new Mat4();

                // we must undo the transform we apply at load time to output data
                if (!keepWorldTransform) {
                    mat.setFromEulerAngles(0, 0, -180);
                    mat.mul2(mat, splat.entity.getWorldTransform());
                }

                // combine with transform palette matrix
                if (transform.transformIndex > 0) {
                    splat.transformPalette.getTransform(transform.transformIndex, tmpMat);
                    mat.mul2(mat, tmpMat);
                }

                transform.mat = mat;
            }

            return transform.mat;
        };

        this.getRot = (index: number) => {
            const transform = getTransform(index);

            if (!transform.rot) {
                transform.rot = new Quat().setFromMat4(this.getMat(index));
            }

            return transform.rot;
        };

        this.getScale = (index: number) => {
            const transform = getTransform(index);

            if (!transform.scale) {
                const scale = new Vec3();
                this.getMat(index).getScale(scale);
                transform.scale = scale;
            }

            return transform.scale;
        };

        this.getSHRot = (index: number) => {
            const transform = getTransform(index);

            if (!transform.shRot) {
                tmpQuat.setFromMat4(this.getMat(index));
                tmpMat3.setFromQuat(tmpQuat);
                transform.shRot = new SHRotation(tmpMat3);
            }

            return transform.shRot;
        };
    }
}

// helper class for extracting and transforming a single splat's data
// to prepare it for export
class SingleSplat {
    // final data keyed on member name
    data: any = {};

    // read a single gaussian's data and transform it for export
    read: (splats: Splat, i: number) => void;

    // specify the data members required
    constructor(members: string[], serializeSettings: SerializeSettings) {
        const data: any = {};
        members.forEach((name) => {
            data[name] = 0;
        });

        const hasPosition = ['x', 'y', 'z'].every(v => data.hasOwnProperty(v));
        const hasRotation = ['rot_0', 'rot_1', 'rot_2', 'rot_3'].every(v => data.hasOwnProperty(v));
        const hasScale = ['scale_0', 'scale_1', 'scale_2'].every(v => data.hasOwnProperty(v));
        const hasColor = ['f_dc_0', 'f_dc_1', 'f_dc_2'].every(v => data.hasOwnProperty(v));
        const hasOpacity = data.hasOwnProperty('opacity');

        const dstSHBands = calcSHBands(new Set(Object.keys(data)));
        const dstSHCoeffs = shBandCoeffs[dstSHBands];
        const tmpSHData = dstSHBands ? new Float32Array(dstSHCoeffs) : null;

        type CacheEntry = {
            splat: Splat;
            transformCache: SplatTransformCache;
            srcProps: { [name: string]: Float32Array };
            grade: ColorGrade;
        };

        const cacheMap = new Map<Splat, CacheEntry>();
        let cacheEntry: CacheEntry;

        const read = (splat: Splat, i: number) => {
            // get the cached data entry for this splat
            if (splat !== cacheEntry?.splat) {
                if (!cacheMap.has(splat)) {
                    const transformCache = new SplatTransformCache(splat, serializeSettings.keepWorldTransform);

                    const srcPropNames = getVertexProperties(splat.splatData);
                    const srcSHBands = calcSHBands(srcPropNames);
                    const srcSHCoeffs = shBandCoeffs[srcSHBands];

                    // cache the props objects
                    const srcProps: { [name: string]: Float32Array } = {};

                    members.forEach((name) => {
                        const shIndex = shNames.indexOf(name);
                        if (shIndex >= 0) {
                            const a = Math.floor(shIndex / dstSHCoeffs);
                            const b = shIndex % dstSHCoeffs;
                            srcProps[name] = (b < srcSHCoeffs) ? splat.splatData.getProp(shNames[a * srcSHCoeffs + b]) as Float32Array : null;
                        } else {
                            srcProps[name] = splat.splatData.getProp(name) as Float32Array;
                        }
                    });

                    const grade = new ColorGrade(splat);

                    cacheEntry = { splat, transformCache, srcProps, grade };

                    cacheMap.set(splat, cacheEntry);
                } else {
                    cacheEntry = cacheMap.get(splat);
                }
            }

            const { transformCache, srcProps, grade } = cacheEntry;

            // copy members
            members.forEach((name) => {
                data[name] = srcProps[name]?.[i] ?? 0;
            });

            // apply transform palette transforms
            const mat = transformCache.getMat(i);

            if (hasPosition) {
                v.set(data.x, data.y, data.z);
                mat.transformPoint(v, v);
                [data.x, data.y, data.z] = [v.x, v.y, v.z];
            }

            if (hasRotation) {
                const quat = transformCache.getRot(i);
                q.set(data.rot_1, data.rot_2, data.rot_3, data.rot_0).mul2(quat, q);
                [data.rot_1, data.rot_2, data.rot_3, data.rot_0] = [q.x, q.y, q.z, q.w];
            }

            if (hasScale) {
                const scale = transformCache.getScale(i);
                data.scale_0 = Math.log(Math.exp(data.scale_0) * scale.x);
                data.scale_1 = Math.log(Math.exp(data.scale_1) * scale.y);
                data.scale_2 = Math.log(Math.exp(data.scale_2) * scale.z);
            }

            if (dstSHBands > 0) {
                for (let c = 0; c < 3; ++c) {
                    for (let d = 0; d < dstSHCoeffs; ++d) {
                        tmpSHData[d] = data[shNames[c * dstSHCoeffs + d]];
                    }

                    transformCache.getSHRot(i).apply(tmpSHData);

                    for (let d = 0; d < dstSHCoeffs; ++d) {
                        data[shNames[c * dstSHCoeffs + d]] = tmpSHData[d];
                    }
                }
            }

            if (!serializeSettings.keepColorTint && hasColor && grade.hasTint) {
                const c = {
                    r: dcDecode(data.f_dc_0),
                    g: dcDecode(data.f_dc_1),
                    b: dcDecode(data.f_dc_2)
                };

                grade.applyDC(c);
                data.f_dc_0 = dcEncode(c.r);
                data.f_dc_1 = dcEncode(c.g);
                data.f_dc_2 = dcEncode(c.b);

                if (dstSHBands > 0) {
                    for (let d = 0; d < dstSHCoeffs; ++d) {
                        c.r = data[shNames[d]];
                        c.g = data[shNames[d + dstSHCoeffs]];
                        c.b = data[shNames[d + dstSHCoeffs * 2]];

                        grade.applySH(c);
                        data[shNames[d]] = c.r;
                        data[shNames[d + dstSHCoeffs]] = c.g;
                        data[shNames[d + dstSHCoeffs * 2]] = c.b;
                    }
                }
            }

            if (!serializeSettings.keepColorTint && hasOpacity && splat.transparency !== 1) {
                data.opacity = grade.applyOpacity(data.opacity);
            }
        };

        this.data = data;
        this.read = read;
    }
}

// Number of f_rest_* SH coefficients per band level (mirrors splat-transform's
// SH_REST_COUNTS; that constant isn't exported from the package root).
const SH_REST_COUNTS: Record<number, number> = { 0: 0, 1: 9, 2: 24, 3: 45 };

// Gaussians per chunk when streaming a scene to splat-transform. Chosen to
// bound the transient working set (input layer buffers + writer output buffer)
// rather than scale with the whole scene.
const EXPORT_CHUNK_SIZE = 256 * 1024;

// Build the canonical per-layer byte layout splat-transform expects. The
// interleaved packing here must match splat-transform's readers/materialize:
// position = xyz (stride 12); geometric = rot0-3, scale0-2, opacity (stride 32);
// color = dc0-2 then f_rest_* (stride (3 + numRest) * 4).
const buildLayouts = (numRest: number): Partial<Record<ChunkLayer, LayerLayout>> => ({
    position: {
        stride: 12,
        fields: { position: { byteOffset: 0, components: 3, type: 'float32' } }
    },
    geometric: {
        stride: 32,
        fields: {
            rotation: { byteOffset: 0, components: 4, type: 'float32' },
            scale: { byteOffset: 16, components: 3, type: 'float32' },
            opacity: { byteOffset: 28, components: 1, type: 'float32' }
        }
    },
    color: {
        stride: (3 + numRest) * 4,
        fields: numRest > 0 ? {
            dc: { byteOffset: 0, components: 3, type: 'float32' },
            shRest: { byteOffset: 12, components: numRest, type: 'float32' }
        } : {
            dc: { byteOffset: 0, components: 3, type: 'float32' }
        }
    }
});

/**
 * A lazy, chunked ChunkSource over a set of Splats, for feeding splat-transform's
 * streaming writers (writeSource) without materializing a whole-scene copy.
 *
 * It is the streaming analog of the old extractDataTable/DataTable path:
 * gaussians are filtered
 * (deleted/selection/opacity/invalid) and transformed (world + palette + SH
 * rotation + colour tint + PLY-space flip) on demand via SingleSplat, one chunk
 * at a time. The output is in PLY space, so the source is tagged Transform.PLY
 * (identity) and the writers' bakeTransform is a no-op.
 */
class SuperSplatChunkSource implements ChunkSource {
    meta: ChunkSourceMetadata;

    private splats: Splat[];
    private splatOf: Uint32Array;   // output row -> index into splats
    private localOf: Uint32Array;   // output row -> gaussian index within that splat
    private singleSplat: SingleSplat;
    private numRest: number;

    constructor(splats: Splat[], settings: SerializeSettings) {
        this.splats = splats;

        // Determine the SH band count to export: the highest band present in any
        // splat, capped by maxSHBands. SingleSplat zero-fills missing bands.
        const splatBands = splats.map(s => calcSHBands(getVertexProperties(s.splatData)));
        const outputBands = Math.min(settings.maxSHBands ?? 3, splatBands.length ? Math.max(...splatBands) : 0);
        const numRest = SH_REST_COUNTS[outputBands];
        this.numRest = numRest;

        // Build the filtered output->source index map (in splat order).
        const filter = new GaussianFilter(settings);
        const total = countGaussians(splats, filter);
        const splatOf = new Uint32Array(total);
        const localOf = new Uint32Array(total);
        let idx = 0;
        for (let s = 0; s < splats.length; ++s) {
            filter.set(splats[s]);
            const n = splats[s].splatData.numSplats;
            for (let i = 0; i < n; ++i) {
                if (filter.test(i)) {
                    splatOf[idx] = s;
                    localOf[idx] = i;
                    idx++;
                }
            }
        }
        this.splatOf = splatOf;
        this.localOf = localOf;

        const members = [
            'x', 'y', 'z',
            'scale_0', 'scale_1', 'scale_2',
            'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity',
            'rot_0', 'rot_1', 'rot_2', 'rot_3',
            ...shNames.slice(0, numRest)
        ];
        this.singleSplat = new SingleSplat(members, settings);

        const numChunks = Math.ceil(total / EXPORT_CHUNK_SIZE);
        this.meta = {
            numGaussians: total,
            numLods: 1,
            lodCounts: [total],
            chunkSize: EXPORT_CHUNK_SIZE,
            numChunks: [numChunks],
            shBands: outputBands as SHBands,
            extraColumns: [],
            transform: Transform.PLY,
            availableLayers: new Set<ChunkLayer>(['position', 'geometric', 'color']),
            layouts: buildLayouts(numRest)
        };
    }

    async read(request: ReadRequest): Promise<void> {
        const isGather = 'indices' in request;
        const anyBuf = (request.position ?? request.geometric ?? request.color) as ChunkData;
        const count = isGather ? request.count : anyBuf.count;
        const chunkBase = isGather ? 0 : request.chunkIndex * EXPORT_CHUNK_SIZE;

        const posF = request.position ? new Float32Array(request.position.data) : null;
        const geoF = request.geometric ? new Float32Array(request.geometric.data) : null;
        const colF = request.color ? new Float32Array(request.color.data) : null;
        const cstride = 3 + this.numRest;

        const { data } = this.singleSplat;

        for (let i = 0; i < count; ++i) {
            const outputRow = isGather ? request.indices[request.indexOffset + i] : chunkBase + i;
            const splat = this.splats[this.splatOf[outputRow]];
            this.singleSplat.read(splat, this.localOf[outputRow]);

            if (posF) {
                const o = i * 3;
                posF[o + 0] = data.x;
                posF[o + 1] = data.y;
                posF[o + 2] = data.z;
            }
            if (geoF) {
                const o = i * 8;
                geoF[o + 0] = data.rot_0;
                geoF[o + 1] = data.rot_1;
                geoF[o + 2] = data.rot_2;
                geoF[o + 3] = data.rot_3;
                geoF[o + 4] = data.scale_0;
                geoF[o + 5] = data.scale_1;
                geoF[o + 6] = data.scale_2;
                geoF[o + 7] = data.opacity;
            }
            if (colF) {
                const o = i * cstride;
                colF[o + 0] = data.f_dc_0;
                colF[o + 1] = data.f_dc_1;
                colF[o + 2] = data.f_dc_2;
                for (let r = 0; r < this.numRest; ++r) {
                    colF[o + 3 + r] = data[shNames[r]];
                }
            }
        }
    }

    async close(): Promise<void> {
        // nothing to release; the scene data is owned by the editor
    }
}

/**
 * Build a ChunkSource + matching pool over the given splats, or null if nothing
 * passes the export filter.
 */
const createExportSource = (splats: Splat[], settings: SerializeSettings): { source: ChunkSource, pool: ChunkDataPool } | null => {
    const source = new SuperSplatChunkSource(splats, settings);
    if (source.meta.numGaussians === 0) {
        return null;
    }
    const pool = createChunkDataPool({ chunkSize: source.meta.chunkSize });
    return { source, pool };
};

/**
 * Stream the given splats to a file via splat-transform's writeSource. Streaming
 * formats (ply/sog/splat) never build a whole-scene copy; the rest materialize a
 * single transient copy inside the library.
 */
const writeSplatFile = async (
    splats: Splat[],
    settings: SerializeSettings,
    outputFormat: OutputFormat,
    filename: string,
    options: Options,
    fs: FileSystem
): Promise<void> => {
    const built = createExportSource(splats, settings);
    if (!built) {
        return;
    }
    const { source, pool } = built;
    try {
        await writeSource({ filename, outputFormat, source, pool, options, createDevice: createGpuDevice }, fs);
    } finally {
        await source.close();
        pool.destroy();
    }
};

// Thrown when the WebGPU device needed for SOG compression can't be created.
// Callers show a friendly message for this instead of the raw error text.
class WebGPUUnavailableError extends Error {
    constructor() {
        super('WebGPU is not available');
        this.name = 'WebGPUUnavailableError';
    }
}

// Cached WebGPU device for SOG compression
let cachedGpuDevice: WebgpuGraphicsDevice | null = null;
let cachedBackbuffer: Texture | null = null;

const createGpuDevice = async (): Promise<WebgpuGraphicsDevice> => {
    if (cachedGpuDevice) {
        return cachedGpuDevice;
    }

    if (!navigator.gpu) {
        throw new WebGPUUnavailableError();
    }

    // Create a minimal canvas for the graphics device
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;

    const graphicsDevice = new WebgpuGraphicsDevice(canvas, {
        antialias: false,
        depth: false,
        stencil: false
    });

    try {
        await graphicsDevice.createDevice();
    } catch (err) {
        // createDevice fails with an obscure internal error when no adapter
        // is available (e.g. blocklisted GPU or missing drivers)
        console.error(err);
        throw new WebGPUUnavailableError();
    }

    // createDevice can also resolve without creating a device (e.g.
    // blocklisted adapters)
    // @ts-ignore - wgpu is an internal property
    if (!graphicsDevice.wgpu) {
        throw new WebGPUUnavailableError();
    }

    // Create external backbuffer (required by PlayCanvas)
    cachedBackbuffer = new Texture(graphicsDevice, {
        width: 1024,
        height: 512,
        name: 'SogComputeBackbuffer',
        mipmaps: false,
        format: PIXELFORMAT_BGRA8
    });

    // @ts-ignore - externalBackbuffer is an internal property
    graphicsDevice.externalBackbuffer = cachedBackbuffer;

    cachedGpuDevice = graphicsDevice;
    return graphicsDevice;
};

/**
 * Extract Splat data into a DataTable for use with splat-transform writers.
 * This is shared between serializeSog and serializeViewer.
 */
// Bridge splat-transform progress events to supersplat's events.
const createProgressRenderer = (header: string, events?: Events): Renderer => ({
    handle: (event: LogEvent) => {
        switch (event.kind) {
            case 'scopeStart':
                if (event.depth === 0) {
                    events?.fire('progressStart', header);
                } else {
                    events?.fire('progressUpdate', {
                        text: event.index !== undefined && event.total !== undefined ?
                            `Step ${event.index} of ${event.total}: ${event.name}` :
                            event.name,
                        progress: 0
                    });
                }
                break;
            case 'scopeEnd':
                if (event.depth === 0) {
                    events?.fire('progressEnd');
                }
                break;
            case 'barStart':
                events?.fire('progressUpdate', { text: event.name, progress: 0 });
                break;
            case 'barTick':
                events?.fire('progressUpdate', {
                    progress: event.total > 0 ? 100 * event.current / event.total : 0
                });
                break;
            case 'barEnd':
                events?.fire('progressUpdate', { progress: 100 });
                break;
            case 'message':
                if (event.level === 'error') console.error(event.text);
                else if (event.level === 'warn') console.warn(event.text);
                else if (event.level === 'info') console.info(event.text);
                else if (event.level === 'debug') console.debug(event.text);
                break;
            case 'output':
                console.log(event.text);
                break;
        }
    }
});

const serializeViewer = async (splats: Splat[], serializeSettings: SerializeSettings, options: ViewerExportSettings, fs: FileSystem): Promise<void> => {
    const { experienceSettings, events } = options;

    splatTransformLogger.setRenderer(createProgressRenderer('Exporting HTML', events));

    // splat-transform's writers leave their top-level scope open on error
    // (their contract is for the caller to unwind), so we explicitly
    // unwind here to deliver a matching depth-0 `scopeEnd(failed)` to the
    // renderer. That fires `progressEnd` and dismisses the dialog before
    // any error popup is shown.
    try {
        if (options.type === 'html') {
            // Bundled HTML - a single self-contained file
            await writeSplatFile(splats, serializeSettings, 'html-bundle', 'output.html', {
                viewerSettingsJson: experienceSettings,
                iterations: 10
            }, fs);
        } else {
            // Package - write unbundled into a MemoryFileSystem, then ZIP
            const memFs = new MemoryFileSystem();
            await writeSplatFile(splats, serializeSettings, 'html', 'index.html', {
                viewerSettingsJson: experienceSettings,
                iterations: 10
            }, memFs);

            // Create ZIP from memory filesystem results. The try/finally
            // ensures zipFs (and its underlying writer) is closed even if a
            // write throws partway through, so we don't leak the output file.
            const zipWriter = await fs.createWriter('output.zip');
            const zipFs = new ZipFileSystem(zipWriter);
            try {
                for (const [filename, data] of memFs.results.entries()) {
                    const writer = await zipFs.createWriter(filename);
                    await writer.write(data);
                    await writer.close();
                }
            } finally {
                await zipFs.close();
            }
        }
    } catch (err) {
        splatTransformLogger.unwindAll(true);
        throw err;
    }
};

// SOG serialization using splat-transform library

type SogSettings = SerializeSettings & {
    iterations: number;
    events?: Events;
};

const serializeSog = async (splats: Splat[], settings: SogSettings, fs: FileSystem): Promise<void> => {
    const { iterations = 10, events } = settings;

    splatTransformLogger.setRenderer(createProgressRenderer('Exporting SOG', events));

    // Streamed via writeSogSource — no whole-scene DataTable copy.
    // splat-transform's writers leave their top-level scope open on error
    // (their contract is for the caller to unwind), so we explicitly
    // unwind here to deliver a matching depth-0 `scopeEnd(failed)` to the
    // renderer. That fires `progressEnd` and dismisses the dialog before
    // any error popup is shown.
    try {
        await writeSplatFile(splats, settings, 'sog-bundle', 'output.sog', { iterations }, fs);
    } catch (err) {
        splatTransformLogger.unwindAll(true);
        throw err;
    }
};

type SpzSettings = SerializeSettings & {
    version?: 3 | 4;
    events?: Events;
};

const serializeSpz = async (splats: Splat[], settings: SpzSettings, fs: FileSystem): Promise<void> => {
    const { version = 4, events } = settings;

    splatTransformLogger.setRenderer(createProgressRenderer('Exporting SPZ', events));

    // unwind the logger's top-level scope on error (see serializeSog)
    try {
        await writeSplatFile(splats, settings, 'spz', 'output.spz', { spzVersion: version }, fs);
    } catch (err) {
        splatTransformLogger.unwindAll(true);
        throw err;
    }
};

export {
    Writer,
    writeSplatFile,
    serializeSog,
    serializeSpz,
    serializeViewer,
    AnimTrack,
    CameraPose,
    Camera,
    Annotation,
    PostEffectSettings,
    defaultPostEffectSettings,
    ExperienceSettings,
    SerializeSettings,
    SogSettings,
    SpzSettings,
    ViewerExportSettings,
    WebGPUUnavailableError
};
