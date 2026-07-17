import {
    ChunkData,
    ChunkDataPool,
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

const SH_REST_COUNTS = [0, 9, 24, 45];

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
    readonly stateData: Uint8Array;
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
        this.stateData = new Uint8Array(source.meta.numGaussians);

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
        layers: ChunkLayer[],
        callback: (base: number, count: number, data: Partial<Record<ChunkLayer, ChunkData>>) => void
    ) {
        const { source, sourcePool } = this;
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

    private uploadTexture(name: string, fill: (target: Uint16Array | Uint32Array) => Promise<void>) {
        const texture = this.getTexture(name);
        texture.releaseSourceAfterUpload = true;
        const target = texture.lock() as Uint16Array | Uint32Array;
        return fill(target).then(() => {
            texture.unlock();
            texture.upload();
            // Texture.releaseSourceAfterUpload currently only releases ImageBitmap
            // sources. These immutable typed-array levels can be discarded after
            // the synchronous WebGPU upload; the retained ChunkSource is the
            // authoritative CPU-side copy.
            const levels = (texture as any)._levels;
            if (levels) levels[0] = null;
        }, (err) => {
            texture.unlock();
            throw err;
        });
    }

    private async uploadTransformA() {
        await this.uploadTexture('transformA', async (target) => {
            const packed = target as Uint32Array;
            const floats = new Float32Array(packed.buffer);
            const quat = new Quat();
            await this.forEachChunk(['position', 'geometric'], (base, count, chunks) => {
                const position = new Float32Array(chunks.position.data, 0, count * 3);
                const geometric = new Float32Array(chunks.geometric.data, 0, count * 8);
                for (let i = 0; i < count; ++i) {
                    const dst = (base + i) * 4;
                    const pos = i * 3;
                    const geo = i * 8;
                    quat.set(geometric[geo + 1], geometric[geo + 2], geometric[geo + 3], geometric[geo]).normalize();
                    if (quat.w < 0) quat.mulScalar(-1);
                    floats[dst] = position[pos];
                    floats[dst + 1] = position[pos + 1];
                    floats[dst + 2] = position[pos + 2];
                    packed[dst + 3] = FloatPacking.float2Half(quat.x) | (FloatPacking.float2Half(quat.y) << 16);
                }
            });
        });
    }

    private async uploadTransformB() {
        await this.uploadTexture('transformB', async (target) => {
            const packed = target as Uint16Array;
            const quat = new Quat();
            await this.forEachChunk(['geometric'], (base, count, chunks) => {
                const geometric = new Float32Array(chunks.geometric.data, 0, count * 8);
                for (let i = 0; i < count; ++i) {
                    const dst = (base + i) * 4;
                    const geo = i * 8;
                    quat.set(geometric[geo + 1], geometric[geo + 2], geometric[geo + 3], geometric[geo]).normalize();
                    if (quat.w < 0) quat.mulScalar(-1);
                    packed[dst] = FloatPacking.float2Half(Math.exp(geometric[geo + 4]));
                    packed[dst + 1] = FloatPacking.float2Half(Math.exp(geometric[geo + 5]));
                    packed[dst + 2] = FloatPacking.float2Half(Math.exp(geometric[geo + 6]));
                    packed[dst + 3] = FloatPacking.float2Half(quat.z);
                }
            });
        });
    }

    private async uploadColor() {
        await this.uploadTexture('splatColor', async (target) => {
            const packed = target as Uint16Array;
            const SH_C0 = 0.28209479177387814;
            await this.forEachChunk(['geometric', 'color'], (base, count, chunks) => {
                const geometric = new Float32Array(chunks.geometric.data, 0, count * 8);
                const color = new Float32Array(chunks.color.data, 0, count * (3 + SH_REST_COUNTS[this.shBands]));
                const colorStride = 3 + SH_REST_COUNTS[this.shBands];
                for (let i = 0; i < count; ++i) {
                    const dst = (base + i) * 4;
                    const col = i * colorStride;
                    packed[dst] = FloatPacking.float2Half(color[col] * SH_C0 + 0.5);
                    packed[dst + 1] = FloatPacking.float2Half(color[col + 1] * SH_C0 + 0.5);
                    packed[dst + 2] = FloatPacking.float2Half(color[col + 2] * SH_C0 + 0.5);
                    packed[dst + 3] = FloatPacking.float2Half(1 / (1 + Math.exp(-geometric[i * 8 + 7])));
                }
            });
        });
    }

    private async uploadSHTexture(name: string, firstCoeff: number, coeffCount: number) {
        await this.uploadTexture(name, async (target) => {
            const packed = target as Uint32Array;
            const numCoeffs = SH_REST_COUNTS[this.shBands] / 3;
            const colorStride = 3 + SH_REST_COUNTS[this.shBands];
            const t11 = (1 << 11) - 1;
            const t10 = (1 << 10) - 1;
            const value = new Float32Array(1);
            const bits = new Uint32Array(value.buffer);
            const coeffs = new Array(numCoeffs * 3).fill(0);

            await this.forEachChunk(['color'], (base, count, chunks) => {
                const color = new Float32Array(chunks.color.data, 0, count * colorStride);
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
                    const row = base + i;
                    const components = name === 'splatSH_8to11' && this.shBands === 2 ? 1 : 4;
                    const dst = row * components;
                    for (let c = 0; c < coeffCount; ++c) {
                        const coeff = firstCoeff + c;
                        if (coeff === 0) {
                            packed[dst] = bits[0];
                        } else {
                            const o = (coeff - 1) * 3;
                            packed[dst + c] = coeffs[o] << 21 | coeffs[o + 1] << 11 | coeffs[o + 2];
                        }
                    }
                }
            });
        });
    }

    private async uploadState() {
        if (!this.source.meta.availableLayers.has('other')) return;
        const stateField = this.source.meta.layouts.other?.fields.state;
        if (!stateField) return;
        await this.forEachChunk(['other'], (base, count, chunks) => {
            const data = new DataView(chunks.other.data);
            const stride = chunks.other.stride;
            for (let i = 0; i < count; ++i) {
                const offset = i * stride + stateField.byteOffset;
                this.stateData[base + i] = stateField.type === 'uint32' ? data.getUint32(offset, true) : data.getFloat32(offset, true);
            }
        });
    }

    private async upload() {
        await this.uploadTransformA();
        await this.uploadTransformB();
        await this.uploadColor();
        if (this.shBands > 0) await this.uploadSHTexture('splatSH_1to3', 0, 4);
        if (this.shBands > 1) {
            await this.uploadSHTexture('splatSH_4to7', 4, 4);
            await this.uploadSHTexture('splatSH_8to11', 8, this.shBands > 2 ? 4 : 1);
        }
        if (this.shBands > 2) await this.uploadSHTexture('splatSH_12to15', 12, 4);
        await this.uploadState();
        await this.calcSourceAabb();
        this.sourcePool.trim(0);
        this.update(this.source.meta.numGaussians, false);
    }

    private async calcSourceAabb() {
        const min = new Vec3(Infinity, Infinity, Infinity);
        const max = new Vec3(-Infinity, -Infinity, -Infinity);
        await this.forEachChunk(['position'], (_base, count, chunks) => {
            const position = new Float32Array(chunks.position.data, 0, count * 3);
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
        this.aabb = new BoundingBox();
        this.aabb.setMinMax(min, max);
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
