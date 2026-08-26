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
    defaultPostEffectSettings,
    type AnimTrack,
    type Annotation,
    type Camera,
    type CameraPose,
    type ExperienceSettings,
    type PostEffectSettings
} from '@playcanvas/splat-transform/viewer-settings';
import {
    Mat3,
    Mat4,
    PIXELFORMAT_BGRA8,
    Quat,
    Texture,
    Vec3,
    WebgpuGraphicsDevice
} from 'playcanvas';

import { version } from '../package.json';
import { ColorGrade, createGradeTerms, dcDecode, dcEncode, sigmoid } from './color-grade';
import { Events } from './events';
import { groupInstancesByChunk } from './gaussian-instances';
import { PermutedChunkSource } from './io';
import { SHRotation } from './sh-utils';
import { Splat } from './splat';
import type { EditorSplatResource } from './splat-resource';
import { State } from './splat-state';

type SerializeSettings = {
    maxSHBands?: number;            // specifies the maximum number of bands to be exported
    selected?: boolean;             // only export selected gaussians. used for copy/paste
    minOpacity?: number;            // filter out gaussians with alpha less than or equal to minAlpha
    removeInvalid?: boolean;        // filter out gaussians with invalid data (NaN/Infinity)

    // the following options are used when serializing for document save.
    // keepWorldTransform flows through the streaming source; keepStateData
    // is accepted for compatibility but the streaming writers never export state.
    keepStateData?: boolean;        // keep the state data array
    keepWorldTransform?: boolean;   // don't apply the world transform when resolving splat transforms
};

type ViewerExportSettings = {
    type: 'html' | 'zip';
    experienceSettings: ExperienceSettings;
    events?: Events;
};

type ProgressFunc = (loaded: number, total: number) => void;

const shBandCoeffs = [0, 3, 8, 15];

// calculate splat transforms on demand and cache the result for next time
class SplatTransformCache {
    getMat: (index: number) => Mat4;
    getRot: (index: number) => Quat;
    getScale: (index: number) => Vec3;
    getSHRot: (index: number) => SHRotation;

    constructor(splat: Splat, keepWorldTransform = false) {
        const transforms = new Map<number, { transformIndex: number, mat: Mat4, rot: Quat, scale: Vec3, shRot: SHRotation }>();
        const { instances } = splat;
        const tmpMat = new Mat4();
        const tmpMat3 = new Mat3();
        const tmpQuat = new Quat();

        // `index` is the instance being exported; the cache itself is keyed by
        // palette entry, which is what makes it a cache
        const getTransform = (index: number) => {
            const transformIndex = instances.transformIndex(index);
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

// Resolve an instance's baked colour grade on demand and cache it, the colour
// analogue of SplatTransformCache. Keyed by colour palette entry, so a scene
// where every gaussian shares one grade costs one ColorGrade.
class ColorGradeCache {
    get: (index: number) => ColorGrade;

    constructor(splat: Splat) {
        const grades = new Map<number, ColorGrade>();
        const { instances } = splat;
        const entry = createGradeTerms();

        this.get = (index: number) => {
            const colorIndex = instances.colorIndex(index);
            let result = grades.get(colorIndex);
            if (!result) {
                splat.colorPalette.getEntry(colorIndex, entry);
                result = new ColorGrade(entry);
                grades.set(colorIndex, result);
            }
            return result;
        };
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

const sourceChunkCount = (source: ChunkSource, chunkIndex: number) => {
    return Math.min(source.meta.chunkSize, source.meta.numGaussians - chunkIndex * source.meta.chunkSize);
};

const validFloatLayer = (chunk: ChunkData, row: number) => {
    const values = new Float32Array(chunk.data, row * chunk.stride, chunk.stride / 4);
    for (let i = 0; i < values.length; ++i) {
        if (!Number.isFinite(values[i])) return false;
    }
    return true;
};

const validGeometric = (chunk: ChunkData, row: number) => {
    const values = new Float32Array(chunk.data, row * chunk.stride, chunk.stride / 4);
    for (let i = 0; i < 4; ++i) if (!Number.isFinite(values[i])) return false;
    for (let i = 4; i < 7; ++i) {
        if (!Number.isFinite(values[i]) && values[i] !== -Infinity) return false;
    }
    return !Number.isNaN(values[7]);
};

const validOther = (chunk: ChunkData, row: number) => {
    const view = new DataView(chunk.data);
    for (const field of Object.values(chunk.fields)) {
        if (field.type !== 'float32') continue;
        for (let i = 0; i < field.components; ++i) {
            const value = view.getFloat32(row * chunk.stride + field.byteOffset + i * 4, true);
            if (!Number.isFinite(value)) return false;
        }
    }
    return true;
};

const filteredIndices = async (splat: Splat, settings: SerializeSettings) => {
    const { source } = splat.resource;
    const state = splat.instances.flags;
    const numInstances = splat.instances.count;
    const onlySelected = settings.selected ?? false;
    const minOpacity = settings.minOpacity ?? 0;
    const removeInvalid = settings.removeInvalid ?? false;
    const needsSource = minOpacity > 0 || removeInvalid;

    if (!needsSource) {
        let count = 0;
        for (let i = 0; i < numInstances; ++i) {
            if (!onlySelected || state[i] === State.selected) count++;
        }
        const result = new Uint32Array(count);
        for (let i = 0, dst = 0; i < numInstances; ++i) {
            if (!onlySelected || state[i] === State.selected) result[dst++] = i;
        }
        return result;
    }

    const pool = createChunkDataPool({ chunkSize: source.meta.chunkSize });
    // the source has to be read sequentially, which visits instances in source
    // order, so acceptance is recorded in a mask and emitted in instance order
    const { starts, ordered } = groupInstancesByChunk(splat.instances, source.meta.chunkSize, source.meta.numChunks[0]);
    const accepted = new Uint8Array(numInstances);
    let total = 0;
    try {
        for (let chunkIndex = 0; chunkIndex < source.meta.numChunks[0]; ++chunkIndex) {
            const count = sourceChunkCount(source, chunkIndex);
            const position = removeInvalid ? pool.acquire('position', source.meta.layouts.position, count) : undefined;
            const geometric = pool.acquire('geometric', source.meta.layouts.geometric, count);
            const color = removeInvalid ? pool.acquire('color', source.meta.layouts.color, count) : undefined;
            const other = removeInvalid && source.meta.availableLayers.has('other') ? pool.acquire('other', source.meta.layouts.other, count) : undefined;
            try {
                await source.read({ chunkIndex, position, geometric, color, other });
                const opacity = new Float32Array(geometric.data);
                const base = chunkIndex * source.meta.chunkSize;
                for (let slot = starts[chunkIndex]; slot < starts[chunkIndex + 1]; ++slot) {
                    const instance = ordered[slot];
                    if (onlySelected && state[instance] !== State.selected) continue;
                    const i = splat.instances.sourceRow[instance] - base;
                    if (minOpacity > 0 && sigmoid(opacity[i * 8 + 7]) < minOpacity) continue;
                    if (removeInvalid && (!validFloatLayer(position, i) || !validGeometric(geometric, i) ||
                        !validFloatLayer(color, i) || (other && !validOther(other, i)))) continue;
                    accepted[instance] = 1;
                    total++;
                }
            } finally {
                position?.release();
                geometric.release();
                color?.release();
                other?.release();
            }
        }
    } finally {
        pool.destroy();
    }

    const result = new Uint32Array(total);
    for (let i = 0, dst = 0; i < numInstances; ++i) {
        if (accepted[i]) result[dst++] = i;
    }
    return result;
};

type ExportEntry = {
    splat: Splat;
    indices: Uint32Array;
    start: number;
    end: number;
    transform: SplatTransformCache;
    grade: ColorGradeCache;
};

/**
 * A lazy, chunked ChunkSource over a set of Splats, for feeding splat-transform's
 * streaming writers (writeSource) without materializing a whole-scene copy.
 *
 * It is the streaming analog of the old extractDataTable/DataTable path:
 * gaussians are filtered
 * (selection/opacity/invalid) and transformed (world + palette + SH
 * rotation + colour tint + PLY-space flip) on demand via SingleSplat, one chunk
 * at a time. The output is in PLY space, so the source is tagged Transform.PLY
 * (identity) and the writers' bakeTransform is a no-op.
 */
class SuperSplatChunkSource implements ChunkSource {
    meta: ChunkSourceMetadata;

    private entries: ExportEntry[];
    private settings: SerializeSettings;
    private numRest: number;
    private pools = new Map<Splat, ChunkDataPool>();

    private constructor(entries: ExportEntry[], settings: SerializeSettings, outputBands: number) {
        this.entries = entries;
        this.settings = settings;
        this.numRest = SH_REST_COUNTS[outputBands];
        const total = entries.length ? entries[entries.length - 1].end : 0;

        const numChunks = Math.ceil(total / EXPORT_CHUNK_SIZE);
        this.meta = {
            numGaussians: total,
            numLods: 1,
            lodCounts: [total],
            chunkSize: EXPORT_CHUNK_SIZE,
            numChunks: [numChunks],
            shBands: outputBands as SHBands,
            // supersplat's edit pipeline doesn't carry the trained-model tag
            // (antialiased / 2dgs) through load, so exports are untagged
            model: 'default',
            extraColumns: [],
            transform: Transform.PLY,
            availableLayers: new Set<ChunkLayer>(['position', 'geometric', 'color']),
            layouts: buildLayouts(this.numRest)
        };
    }

    static async create(splats: Splat[], settings: SerializeSettings) {
        const outputBands = Math.min(settings.maxSHBands ?? 3, splats.length ? Math.max(...splats.map(s => s.resource.shBands)) : 0);
        const entries: ExportEntry[] = [];
        let start = 0;
        for (const splat of splats) {
            const indices = await filteredIndices(splat, settings);
            const end = start + indices.length;
            entries.push({
                splat,
                indices,
                start,
                end,
                transform: new SplatTransformCache(splat, settings.keepWorldTransform),
                grade: new ColorGradeCache(splat)
            });
            start = end;
        }
        return new SuperSplatChunkSource(entries, settings, outputBands);
    }

    private findEntry(row: number) {
        let lo = 0;
        let hi = this.entries.length - 1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            const entry = this.entries[mid];
            if (row < entry.start) hi = mid - 1;
            else if (row >= entry.end) lo = mid + 1;
            else return entry;
        }
        return null;
    }

    // `instanceIndices` selects instances of `entry.splat`; the static data is
    // gathered by their source rows, while the palette and grade lookups stay in
    // instance space (two instances of one row can carry different transforms)
    private async readGroup(entry: ExportEntry, instanceIndices: Uint32Array, outputOffset: number, request: ReadRequest) {
        const { splat, transform, grade: gradeCache } = entry;
        const source = splat.resource.source;
        const { sourceRow } = splat.instances;
        const indices = new Uint32Array(instanceIndices.length);
        for (let i = 0; i < instanceIndices.length; ++i) {
            indices[i] = sourceRow[instanceIndices[i]];
        }
        let pool = this.pools.get(splat);
        if (!pool) {
            pool = createChunkDataPool({ chunkSize: source.meta.chunkSize });
            this.pools.set(splat, pool);
        }

        const count = indices.length;
        const position = request.position ? pool.acquire('position', source.meta.layouts.position, count) : undefined;
        const geometric = request.geometric ? pool.acquire('geometric', source.meta.layouts.geometric, count) : undefined;
        const color = request.color ? pool.acquire('color', source.meta.layouts.color, count) : undefined;
        try {
            await source.read({ indices, indexOffset: 0, count, position, geometric, color });
            const srcPosition = position ? new Float32Array(position.data) : null;
            const srcGeometric = geometric ? new Float32Array(geometric.data) : null;
            const srcColor = color ? new Float32Array(color.data) : null;
            const dstPosition = request.position ? new Float32Array(request.position.data) : null;
            const dstGeometric = request.geometric ? new Float32Array(request.geometric.data) : null;
            const dstColor = request.color ? new Float32Array(request.color.data) : null;
            const srcRest = SH_REST_COUNTS[source.meta.shBands];
            const srcCoeffs = shBandCoeffs[source.meta.shBands];
            const dstCoeffs = this.numRest / 3;
            const rest = new Float32Array(this.numRest);
            const tmpSH = new Float32Array(dstCoeffs);
            const positionValue = new Vec3();
            const rotationValue = new Quat();
            const c = { r: 0, g: 0, b: 0 };

            for (let i = 0; i < count; ++i) {
                const instance = instanceIndices[i];
                if (dstPosition) {
                    const src = i * 3;
                    const dst = (outputOffset + i) * 3;
                    positionValue.set(srcPosition[src], srcPosition[src + 1], srcPosition[src + 2]);
                    transform.getMat(instance).transformPoint(positionValue, positionValue);
                    dstPosition[dst] = positionValue.x;
                    dstPosition[dst + 1] = positionValue.y;
                    dstPosition[dst + 2] = positionValue.z;
                }
                if (dstGeometric) {
                    const src = i * 8;
                    const dst = (outputOffset + i) * 8;
                    rotationValue.set(srcGeometric[src + 1], srcGeometric[src + 2], srcGeometric[src + 3], srcGeometric[src]);
                    rotationValue.mul2(transform.getRot(instance), rotationValue);
                    dstGeometric[dst] = rotationValue.w;
                    dstGeometric[dst + 1] = rotationValue.x;
                    dstGeometric[dst + 2] = rotationValue.y;
                    dstGeometric[dst + 3] = rotationValue.z;
                    const scale = transform.getScale(instance);
                    dstGeometric[dst + 4] = Math.log(Math.exp(srcGeometric[src + 4]) * scale.x);
                    dstGeometric[dst + 5] = Math.log(Math.exp(srcGeometric[src + 5]) * scale.y);
                    dstGeometric[dst + 6] = Math.log(Math.exp(srcGeometric[src + 6]) * scale.z);
                    const grade = gradeCache.get(instance);
                    dstGeometric[dst + 7] = grade.hasTransparency ?
                        grade.applyOpacity(srcGeometric[src + 7]) : srcGeometric[src + 7];
                }
                if (dstColor) {
                    const grade = gradeCache.get(instance);
                    const src = i * (3 + srcRest);
                    const dst = (outputOffset + i) * (3 + this.numRest);
                    c.r = dcDecode(srcColor[src]);
                    c.g = dcDecode(srcColor[src + 1]);
                    c.b = dcDecode(srcColor[src + 2]);
                    if (grade.hasTint) grade.applyDC(c);
                    dstColor[dst] = dcEncode(c.r);
                    dstColor[dst + 1] = dcEncode(c.g);
                    dstColor[dst + 2] = dcEncode(c.b);

                    rest.fill(0);
                    if (dstCoeffs > 0) {
                        for (let channel = 0; channel < 3; ++channel) {
                            tmpSH.fill(0);
                            const copy = Math.min(srcCoeffs, dstCoeffs);
                            for (let coeff = 0; coeff < copy; ++coeff) {
                                tmpSH[coeff] = srcColor[src + 3 + channel * srcCoeffs + coeff];
                            }
                            transform.getSHRot(instance).apply(tmpSH);
                            rest.set(tmpSH, channel * dstCoeffs);
                        }
                        if (grade.hasTint) {
                            for (let coeff = 0; coeff < dstCoeffs; ++coeff) {
                                c.r = rest[coeff];
                                c.g = rest[dstCoeffs + coeff];
                                c.b = rest[dstCoeffs * 2 + coeff];
                                grade.applySH(c);
                                rest[coeff] = c.r;
                                rest[dstCoeffs + coeff] = c.g;
                                rest[dstCoeffs * 2 + coeff] = c.b;
                            }
                        }
                        dstColor.set(rest, dst + 3);
                    }
                }
            }
        } finally {
            position?.release();
            geometric?.release();
            color?.release();
        }
    }

    async read(request: ReadRequest): Promise<void> {
        const isGather = 'indices' in request;
        const anyBuf = (request.position ?? request.geometric ?? request.color) as ChunkData;
        const count = isGather ? request.count : anyBuf.count;
        const chunkBase = isGather ? 0 : request.chunkIndex * EXPORT_CHUNK_SIZE;

        let offset = 0;
        while (offset < count) {
            const outputRow = isGather ? request.indices[request.indexOffset + offset] : chunkBase + offset;
            const entry = this.findEntry(outputRow);
            if (!entry) throw new Error(`Invalid export row ${outputRow}`);
            const maxCount = entry.splat.resource.source.meta.chunkSize;
            let groupCount = 1;
            while (offset + groupCount < count && groupCount < maxCount) {
                const nextRow = isGather ? request.indices[request.indexOffset + offset + groupCount] : chunkBase + offset + groupCount;
                if (this.findEntry(nextRow) !== entry) break;
                groupCount++;
            }
            const instanceIndices = new Uint32Array(groupCount);
            for (let i = 0; i < groupCount; ++i) {
                const row = isGather ? request.indices[request.indexOffset + offset + i] : chunkBase + offset + i;
                instanceIndices[i] = entry.indices[row - entry.start];
            }
            await this.readGroup(entry, instanceIndices, offset, request);
            offset += groupCount;
        }
    }

    close(): Promise<void> {
        this.pools.forEach(pool => pool.destroy());
        this.pools.clear();
        return Promise.resolve();
    }
}

/**
 * Build a ChunkSource + matching pool over the given splats, or null if nothing
 * passes the export filter.
 */
const createExportSource = async (splats: Splat[], settings: SerializeSettings): Promise<{ source: ChunkSource, pool: ChunkDataPool } | null> => {
    const source = await SuperSplatChunkSource.create(splats, settings);
    if (source.meta.numGaussians === 0) {
        return null;
    }
    const pool = createChunkDataPool({ chunkSize: source.meta.chunkSize });
    return { source, pool };
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
    const built = await createExportSource(splats, settings);
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

/**
 * Write a resource's static gaussian data, restricted to `rows` (in-memory row
 * indices, ascending) and in that order. Nothing is baked - no entity transform,
 * no palette, no grade - because a .ssproj stores the static tier untouched and
 * keeps every per-layer edit in a side blob. Writing to PLY is a no-op bake for
 * all our inputs: `Transform.PLY` is the convention for PLY, splat, KSplat, SPZ
 * and SOG alike, which is every format the editor loads.
 *
 * The source is NOT closed here - it belongs to the resource and outlives the save.
 */
const writeResourceFile = async (
    resource: EditorSplatResource,
    rows: Uint32Array,
    filename: string,
    fs: FileSystem
): Promise<void> => {
    const retained = resource.source;

    // PermutedChunkSource gathers through an order array, which is exactly a row
    // filter. The loader usually leaves a morton permutation in place, so compose
    // the two orders and wrap its parent - one gather on the file rather than two.
    let source: ChunkSource;
    if (retained instanceof PermutedChunkSource) {
        const composed = new Uint32Array(rows.length);
        for (let i = 0; i < rows.length; ++i) {
            composed[i] = retained.order[rows[i]];
        }
        source = new PermutedChunkSource(retained.parent, composed);
    } else {
        source = new PermutedChunkSource(retained, rows);
    }

    const pool = createChunkDataPool({ chunkSize: source.meta.chunkSize });
    try {
        await writeSource({ filename, outputFormat: 'ply', source, pool, options: {}, createDevice: createGpuDevice }, fs);
    } finally {
        pool.destroy();
    }
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
    writeResourceFile,
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
