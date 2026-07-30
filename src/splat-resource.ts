import {
    ChunkData,
    ChunkDataPool,
    ChunkField,
    ChunkLayer,
    ChunkSource,
    SHBands,
    createChunkDataPool
} from '@playcanvas/splat-transform';
import {
    PIXELFORMAT_R32U,
    PIXELFORMAT_RGBA16F,
    PIXELFORMAT_RGBA32U,
    BoundingBox,
    FloatPacking,
    GraphicsDevice,
    GSplatContainer,
    GSplatFormat,
    Quat,
    Vec3
} from 'playcanvas';

import { PermutedChunkSource } from './io';

const SH_REST_COUNTS = [0, 9, 24, 45];

// One SH texture filled by the upload sweep: which packed coefficient words it
// stores and its per-row component count.
type SHTarget = {
    packed: Uint32Array;
    firstCoeff: number;
    coeffCount: number;
    components: number;
};

const chunkCount = (source: ChunkSource, chunkIndex: number) => {
    return Math.min(source.meta.chunkSize, source.meta.numGaussians - chunkIndex * source.meta.chunkSize);
};

const acquire = (pool: ChunkDataPool, source: ChunkSource, layer: ChunkLayer, count: number) => {
    return pool.acquire(layer, source.meta.layouts[layer], count);
};

class EditorSplatResource extends GSplatContainer {
    readonly source: ChunkSource;
    readonly sourcePool: ChunkDataPool;
    readonly shBands: SHBands;
    // the state column as loaded from file. read-only after upload: the live
    // editor state belongs to the instance list, not to the static resource
    readonly initialState: Uint8Array;
    readonly propertyNames: ReadonlySet<string>;

    private closed = false;

    private constructor(device: GraphicsDevice, source: ChunkSource) {
        const { shBands } = source.meta;
        const streams: { name: string, format: number }[] = [
            { name: 'splatColor', format: PIXELFORMAT_RGBA16F },
            { name: 'transformA', format: PIXELFORMAT_RGBA32U },
            { name: 'transformB', format: PIXELFORMAT_RGBA16F }
        ];
        if (shBands > 0) {
            streams.push({ name: 'splatSH_1to3', format: PIXELFORMAT_RGBA32U });
            if (shBands > 1) {
                streams.push({ name: 'splatSH_4to7', format: PIXELFORMAT_RGBA32U });
                streams.push({ name: 'splatSH_8to11', format: shBands > 2 ? PIXELFORMAT_RGBA32U : PIXELFORMAT_R32U });
                if (shBands > 2) {
                    streams.push({ name: 'splatSH_12to15', format: PIXELFORMAT_RGBA32U });
                }
            }
        }

        const format = new GSplatFormat(device, streams, {
            readWGSL: '#include "gsplatUncompressedVS"'
        });
        super(device, source.meta.numGaussians, format);

        this.source = source;
        const pooledBytes = Object.values(source.meta.layouts).reduce((sum, layout) => sum + layout.stride * source.meta.chunkSize, 0);
        this.sourcePool = createChunkDataPool({
            chunkSize: source.meta.chunkSize,
            maxPooledBytes: pooledBytes
        });
        this.shBands = shBands;
        this.initialState = new Uint8Array(source.meta.numGaussians);

        const properties = new Set([
            'x', 'y', 'z',
            'scale_0', 'scale_1', 'scale_2',
            'rot_0', 'rot_1', 'rot_2', 'rot_3',
            'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity'
        ]);
        for (let i = 0; i < SH_REST_COUNTS[shBands]; ++i) {
            properties.add(`f_rest_${i}`);
        }
        source.meta.extraColumns.forEach(column => properties.add(column.name));
        properties.add('state');
        properties.add('transform');
        this.propertyNames = properties;
    }

    // rows of static gaussian data. named apart from the live instance count on
    // Splat so the two iteration domains can't be confused
    get numRows() {
        return this.numSplats;
    }

    static async create(device: GraphicsDevice, source: ChunkSource) {
        const resource = new EditorSplatResource(device, source);
        try {
            await resource.upload();
            return resource;
        } catch (err) {
            await resource.close();
            resource.destroy();
            throw err;
        }
    }

    private async forEachChunk(
        source: ChunkSource,
        layers: ChunkLayer[],
        callback: (base: number, count: number, data: Partial<Record<ChunkLayer, ChunkData>>) => void
    ) {
        const { sourcePool } = this;
        for (let chunkIndex = 0; chunkIndex < source.meta.numChunks[0]; ++chunkIndex) {
            const count = chunkCount(source, chunkIndex);
            const chunks: Partial<Record<ChunkLayer, ChunkData>> = {};
            for (const layer of layers) {
                chunks[layer] = acquire(sourcePool, source, layer, count);
            }
            try {
                await source.read({ chunkIndex, ...chunks });
                callback(chunkIndex * source.meta.chunkSize, count, chunks);
            } finally {
                Object.values(chunks).forEach(chunk => chunk.release());
            }
        }
    }

    private fillTransformA(packed: Uint32Array, position: Float32Array, geometric: Float32Array, base: number, count: number, remap: Uint32Array | null) {
        const floats = new Float32Array(packed.buffer);
        const quat = new Quat();
        for (let i = 0; i < count; ++i) {
            const dst = (remap ? remap[base + i] : base + i) * 4;
            const pos = i * 3;
            const geo = i * 8;
            quat.set(geometric[geo + 1], geometric[geo + 2], geometric[geo + 3], geometric[geo]).normalize();
            if (quat.w < 0) quat.mulScalar(-1);
            floats[dst] = position[pos];
            floats[dst + 1] = position[pos + 1];
            floats[dst + 2] = position[pos + 2];
            packed[dst + 3] = FloatPacking.float2Half(quat.x) | (FloatPacking.float2Half(quat.y) << 16);
        }
    }

    private fillTransformB(packed: Uint16Array, geometric: Float32Array, base: number, count: number, remap: Uint32Array | null) {
        const quat = new Quat();
        for (let i = 0; i < count; ++i) {
            const dst = (remap ? remap[base + i] : base + i) * 4;
            const geo = i * 8;
            quat.set(geometric[geo + 1], geometric[geo + 2], geometric[geo + 3], geometric[geo]).normalize();
            if (quat.w < 0) quat.mulScalar(-1);
            packed[dst] = FloatPacking.float2Half(Math.exp(geometric[geo + 4]));
            packed[dst + 1] = FloatPacking.float2Half(Math.exp(geometric[geo + 5]));
            packed[dst + 2] = FloatPacking.float2Half(Math.exp(geometric[geo + 6]));
            packed[dst + 3] = FloatPacking.float2Half(quat.z);
        }
    }

    private fillColor(packed: Uint16Array, geometric: Float32Array, color: Float32Array, colorStride: number, base: number, count: number, remap: Uint32Array | null) {
        const SH_C0 = 0.28209479177387814;
        for (let i = 0; i < count; ++i) {
            const dst = (remap ? remap[base + i] : base + i) * 4;
            const col = i * colorStride;
            packed[dst] = FloatPacking.float2Half(color[col] * SH_C0 + 0.5);
            packed[dst + 1] = FloatPacking.float2Half(color[col + 1] * SH_C0 + 0.5);
            packed[dst + 2] = FloatPacking.float2Half(color[col + 2] * SH_C0 + 0.5);
            packed[dst + 3] = FloatPacking.float2Half(1 / (1 + Math.exp(-geometric[i * 8 + 7])));
        }
    }

    // Quantize each row's SH coefficients once (11/10/11-bit triples against
    // the row's max, whose float bits are stored as coefficient word 0) and
    // write all SH textures from the shared result.
    private fillSH(targets: SHTarget[], color: Float32Array, colorStride: number, base: number, count: number, remap: Uint32Array | null) {
        const numCoeffs = SH_REST_COUNTS[this.shBands] / 3;
        const t11 = (1 << 11) - 1;
        const t10 = (1 << 10) - 1;
        const value = new Float32Array(1);
        const bits = new Uint32Array(value.buffer);
        const coeffs = new Array(numCoeffs * 3).fill(0);

        for (let i = 0; i < count; ++i) {
            const col = i * colorStride + 3;
            for (let j = 0; j < numCoeffs; ++j) {
                coeffs[j * 3] = color[col + j];
                coeffs[j * 3 + 1] = color[col + numCoeffs + j];
                coeffs[j * 3 + 2] = color[col + numCoeffs * 2 + j];
            }
            let max = Math.abs(coeffs[0]);
            for (let j = 1; j < coeffs.length; ++j) max = Math.max(max, Math.abs(coeffs[j]));
            if (max === 0) continue;
            for (let j = 0; j < coeffs.length; j += 3) {
                coeffs[j] = Math.max(0, Math.min(t11, Math.floor((coeffs[j] / max * 0.5 + 0.5) * t11 + 0.5)));
                coeffs[j + 1] = Math.max(0, Math.min(t10, Math.floor((coeffs[j + 1] / max * 0.5 + 0.5) * t10 + 0.5)));
                coeffs[j + 2] = Math.max(0, Math.min(t11, Math.floor((coeffs[j + 2] / max * 0.5 + 0.5) * t11 + 0.5)));
            }
            value[0] = max;
            const row = remap ? remap[base + i] : base + i;
            for (const target of targets) {
                const dst = row * target.components;
                for (let c = 0; c < target.coeffCount; ++c) {
                    const coeff = target.firstCoeff + c;
                    if (coeff === 0) {
                        target.packed[dst] = bits[0];
                    } else {
                        const o = (coeff - 1) * 3;
                        target.packed[dst + c] = coeffs[o] << 21 | coeffs[o + 1] << 11 | coeffs[o + 2];
                    }
                }
            }
        }
    }

    private fillState(stateField: ChunkField, other: ChunkData, base: number, count: number, remap: Uint32Array | null) {
        const data = new DataView(other.data);
        const stride = other.stride;
        for (let i = 0; i < count; ++i) {
            const offset = i * stride + stateField.byteOffset;
            const value = stateField.type === 'uint32' ? data.getUint32(offset, true) : data.getFloat32(offset, true);
            this.initialState[remap ? remap[base + i] : base + i] = value;
        }
    }

    private async upload() {
        const { source, shBands } = this;

        // The loader Morton-permutes lazily-read sources (PermutedChunkSource);
        // reading that wrapper sequentially degenerates into full-file random
        // gathers on the underlying file. Sweep the parent in its native file
        // order instead — fast sequential reads — and scatter each row to its
        // permuted destination through the inverse permutation.
        let sweepSource: ChunkSource = source;
        let remap: Uint32Array | null = null;
        if (source instanceof PermutedChunkSource) {
            const { order } = source;
            sweepSource = source.parent;
            remap = new Uint32Array(order.length);
            for (let i = 0; i < order.length; ++i) {
                remap[order[i]] = i;
            }
        }

        const shDefs: { name: string, firstCoeff: number, coeffCount: number, components: number }[] = [];
        if (shBands > 0) {
            shDefs.push({ name: 'splatSH_1to3', firstCoeff: 0, coeffCount: 4, components: 4 });
            if (shBands > 1) {
                shDefs.push({ name: 'splatSH_4to7', firstCoeff: 4, coeffCount: 4, components: 4 });
                const wide = shBands > 2;
                shDefs.push({ name: 'splatSH_8to11', firstCoeff: 8, coeffCount: wide ? 4 : 1, components: wide ? 4 : 1 });
                if (wide) {
                    shDefs.push({ name: 'splatSH_12to15', firstCoeff: 12, coeffCount: 4, components: 4 });
                }
            }
        }

        const textureNames = ['transformA', 'transformB', 'splatColor', ...shDefs.map(sh => sh.name)];
        const textures = textureNames.map(name => this.getTexture(name));
        const targets = textures.map((texture) => {
            texture.releaseSourceAfterUpload = true;
            return texture.lock() as Uint16Array | Uint32Array;
        });
        const shTargets: SHTarget[] = shDefs.map((sh, i) => ({ ...sh, packed: targets[3 + i] as Uint32Array }));

        const stateField = source.meta.availableLayers.has('other') ? source.meta.layouts.other?.fields.state : undefined;
        const layers: ChunkLayer[] = ['position', 'geometric', 'color'];
        if (stateField) layers.push('other');

        const colorStride = 3 + SH_REST_COUNTS[shBands];
        const min = new Vec3(Infinity, Infinity, Infinity);
        const max = new Vec3(-Infinity, -Infinity, -Infinity);

        try {
            // Single sequential sweep: read each chunk once and fill all
            // textures, the state array and the source AABB from it.
            await this.forEachChunk(sweepSource, layers, (base, count, chunks) => {
                const position = new Float32Array(chunks.position.data, 0, count * 3);
                const geometric = new Float32Array(chunks.geometric.data, 0, count * 8);
                const color = new Float32Array(chunks.color.data, 0, count * colorStride);

                this.fillTransformA(targets[0] as Uint32Array, position, geometric, base, count, remap);
                this.fillTransformB(targets[1] as Uint16Array, geometric, base, count, remap);
                this.fillColor(targets[2] as Uint16Array, geometric, color, colorStride, base, count, remap);
                if (shTargets.length > 0) {
                    this.fillSH(shTargets, color, colorStride, base, count, remap);
                }
                if (stateField) {
                    this.fillState(stateField, chunks.other, base, count, remap);
                }
                for (let i = 0; i < count; ++i) {
                    const o = i * 3;
                    min.x = Math.min(min.x, position[o]);
                    min.y = Math.min(min.y, position[o + 1]);
                    min.z = Math.min(min.z, position[o + 2]);
                    max.x = Math.max(max.x, position[o]);
                    max.y = Math.max(max.y, position[o + 1]);
                    max.z = Math.max(max.z, position[o + 2]);
                }
            });
        } catch (err) {
            textures.forEach(texture => texture.unlock());
            throw err;
        }

        textures.forEach((texture) => {
            texture.unlock();
            texture.upload();
            // Texture.releaseSourceAfterUpload currently only releases ImageBitmap
            // sources. These immutable typed-array levels can be discarded after
            // the synchronous WebGPU upload; the retained ChunkSource is the
            // authoritative CPU-side copy.
            const levels = (texture as any)._levels;
            if (levels) levels[0] = null;
        });

        this.aabb = new BoundingBox();
        this.aabb.setMinMax(min, max);

        this.sourcePool.trim(0);
        this.update(source.meta.numGaussians, false);
    }

    async close() {
        if (this.closed) return;
        this.closed = true;
        this.sourcePool.destroy();
        await this.source.close();
    }

    protected _actualDestroy() {
        this.close().catch(console.error);
        super._actualDestroy();
    }
}

export { EditorSplatResource };
