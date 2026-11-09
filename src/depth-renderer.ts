import type { WebgpuGraphicsDevice } from 'playcanvas';
import {
    ADDRESS_CLAMP_TO_EDGE,
    BUFFERUSAGE_COPY_SRC,
    BUFFERUSAGE_COPY_DST,
    FILTER_NEAREST,
    PIXELFORMAT_RGBA32U,
    SAMPLETYPE_UINT,
    SHADERLANGUAGE_WGSL,
    SHADERSTAGE_COMPUTE,
    UNIFORMTYPE_FLOAT,
    UNIFORMTYPE_UINT,
    BindGroupFormat,
    BindStorageBufferFormat,
    BindStorageTextureFormat,
    BindTextureFormat,
    BindUniformBufferFormat,
    Compute,
    Shader,
    StorageBuffer,
    Texture,
    UniformBufferFormat,
    UniformFormat
} from 'playcanvas';

import type { Scene } from './scene';
import { DEPTH_TILE_SIZE, depthComputeShader } from './shaders/depth-render-shader';

const DEPTH_METHODS = ['mean', 'median'] as const;
type DepthMethod = (typeof DEPTH_METHODS)[number];
// Older callers may still request the removed nearest-surface method.
const normalizeDepthMethod = (value: unknown): DepthMethod => (value === 'median' ? 'median' : 'mean');
type DepthInputs = {
    cacheA: Texture;
    cacheB: Texture;
    entries: StorageBuffer;
    splatCount: StorageBuffer;
    cacheWidth: number;
    capacity: number;
};

// Raw pixels contain losslessly stored float32 bits: Z, accumulated alpha,
// reserved, valid (0/1). Integer texture sampling needs no float-filter feature.
class DepthRenderer {
    texture: Texture;
    normalTexture: Texture;
    ready = true;
    error: Error | null = null;
    private notifiedError: string | null = null;
    pending: Promise<void> | null = null;
    private device: WebgpuGraphicsDevice;
    private pipelines: { compute: Compute; shader: Shader; format: BindGroupFormat }[] = [];
    private counts: StorageBuffer;
    private ranges: StorageBuffer;
    private nodes: StorageBuffer;
    readonly stats: StorageBuffer;
    private histogram: StorageBuffer;
    displayRange: [number, number] = [0, 1];
    // number of valid pixels in the last auto-range frame (0 when no depth)
    validPixels = 0;
    private listCapacity = 1 << 20;
    private tiles = 0;
    private destroyed = false;
    private version = 0;
    private checkedVersion = 0;
    private empty = false;
    private dummy: Texture;

    constructor(private scene: Scene) {
        this.device = scene.graphicsDevice as WebgpuGraphicsDevice;
        const device = this.device;
        for (const stage of [
            'count',
            'prefix',
            'init',
            'scatter',
            'sort',
            'resolve',
            'histogram',
            'range',
            'smooth',
            'reset'
        ]) {
            const uints = ['width', 'height', 'tilesX', 'tilesY', 'cacheWidth', 'capacity', 'listCapacity', 'method'];
            const floats = [
                'minOpacity',
                'minContribution',
                'minCoverage',
                'quantile',
                'near',
                'far',
                'rangeNear',
                'rangeFar'
            ];
            const uniforms = new UniformBufferFormat(device, [
                ...uints.map((name) => new UniformFormat(name, UNIFORMTYPE_UINT)),
                ...floats.map((name) => new UniformFormat(name, UNIFORMTYPE_FLOAT)),
                ...['rangeMode', 'rangePad0', 'rangePad1', 'rangePad2'].map(
                    (name) => new UniformFormat(name, UNIFORMTYPE_UINT)
                )
            ]);
            const format = new BindGroupFormat(device, [
                new BindTextureFormat('cacheA', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_UINT, false),
                new BindTextureFormat('cacheB', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_UINT, false),
                new BindStorageBufferFormat('entries', SHADERSTAGE_COMPUTE, true),
                new BindStorageBufferFormat('splatCount', SHADERSTAGE_COMPUTE, true),
                ...['counts', 'ranges', 'nodes', 'stats'].map(
                    (name) => new BindStorageBufferFormat(name, SHADERSTAGE_COMPUTE)
                ),
                new BindStorageTextureFormat('rawDepth', PIXELFORMAT_RGBA32U),
                new BindStorageBufferFormat('histogram', SHADERSTAGE_COMPUTE),
                new BindTextureFormat('rawInput', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_UINT, false),
                new BindUniformBufferFormat('params', SHADERSTAGE_COMPUTE)
            ]);
            const shader = new Shader(device, {
                name: `Depth-${stage}`,
                shaderLanguage: SHADERLANGUAGE_WGSL,
                cshader: depthComputeShader(stage),
                computeBindGroupFormat: format,
                computeUniformBufferFormats: { params: uniforms }
            });
            this.pipelines.push({ compute: new Compute(device, shader, `Depth-${stage}`), shader, format });
        }
        this.stats = new StorageBuffer(device, 24, BUFFERUSAGE_COPY_SRC);
        this.nodes = new StorageBuffer(device, this.listCapacity * 8);
        this.histogram = new StorageBuffer(device, 1024 * 4, BUFFERUSAGE_COPY_DST);
        this.dummy = new Texture(device, {
            name: 'depth-unused-binding',
            width: 1,
            height: 1,
            format: PIXELFORMAT_RGBA32U,
            storage: true,
            mipmaps: false
        });
    }

    private resize(width: number, height: number) {
        if (this.texture?.width === width && this.texture.height === height) return;
        this.texture?.destroy();
        this.normalTexture?.destroy();
        this.normalTexture = undefined;
        this.texture = new Texture(this.device, {
            name: 'rawLinearDepth32',
            width,
            height,
            format: PIXELFORMAT_RGBA32U,
            storage: true,
            mipmaps: false,
            minFilter: FILTER_NEAREST,
            magFilter: FILTER_NEAREST,
            addressU: ADDRESS_CLAMP_TO_EDGE,
            addressV: ADDRESS_CLAMP_TO_EDGE
        });
        const tiles = Math.ceil(width / DEPTH_TILE_SIZE) * Math.ceil(height / DEPTH_TILE_SIZE);
        if (this.tiles !== tiles) {
            this.counts?.destroy();
            this.ranges?.destroy();
            this.counts = new StorageBuffer(this.device, tiles * 4, BUFFERUSAGE_COPY_DST);
            this.ranges = new StorageBuffer(this.device, tiles * 8);
            this.tiles = tiles;
        }
        this.empty = false;
        this.error = null;
    }

    render(inputs: DepthInputs | null, width: number, height: number, method: DepthMethod) {
        this.resize(width, height);
        const version = ++this.version;
        if (!inputs) {
            this.normalTexture?.destroy();
            this.normalTexture = undefined;
            if (!this.empty) {
                (this.texture.lock() as Uint32Array).fill(0);
                this.texture.unlock();
                this.empty = true;
                this.validPixels = 0;
                this.displayRange = [0, 1];
            }
            this.ready = true;
            this.checkedVersion = version;
            return;
        }
        this.empty = false;
        this.error = null;
        this.counts.clear();
        const normals = this.scene.normalRender || this.scene.curvatureRender;
        const captureRange = this.scene.camera.captureDepthRange;
        const autoRange = !normals && !captureRange && this.scene.events.invoke('view.depthRangeMode') === 'auto';
        if (autoRange) this.histogram.clear();
        if (normals && !this.normalTexture) {
            this.normalTexture = new Texture(this.device, {
                name: 'normal-smoothed-depth32',
                width,
                height,
                format: PIXELFORMAT_RGBA32U,
                storage: true,
                mipmaps: false,
                minFilter: FILTER_NEAREST,
                magFilter: FILTER_NEAREST
            });
        }
        const events = this.scene.events;
        const camera = this.scene.camera.camera;
        const params = {
            ...inputs,
            rawDepth: this.texture,
            rawInput: this.texture,
            histogram: this.histogram,
            counts: this.counts,
            ranges: this.ranges,
            nodes: this.nodes,
            stats: this.stats,
            width,
            height,
            tilesX: Math.ceil(width / DEPTH_TILE_SIZE),
            tilesY: Math.ceil(height / DEPTH_TILE_SIZE),
            listCapacity: this.listCapacity,
            method: DEPTH_METHODS.indexOf(normalizeDepthMethod(method)),
            minOpacity: events.invoke('view.minOpacity'),
            minContribution: events.invoke('view.depthContribution'),
            minCoverage: events.invoke('view.depthCoverage'),
            quantile: events.invoke('view.depthQuantile'),
            near: camera.nearClip,
            far: camera.farClip,
            rangeNear:
                captureRange?.[0] ??
                (events.invoke('view.depthRangeMode') === 'fixed'
                    ? events.invoke('view.depthRangeNear')
                    : this.scene.camera.depthDisplayRange()[0]),
            rangeFar:
                captureRange?.[1] ??
                (events.invoke('view.depthRangeMode') === 'fixed'
                    ? events.invoke('view.depthRangeFar')
                    : this.scene.camera.depthDisplayRange()[1]),
            rangeMode: autoRange ? 0 : 1,
            rangePad0: 0,
            rangePad1: 0,
            rangePad2: 0
        };
        const groups = Math.ceil(inputs.capacity / 128);
        [9, 0, 1, 2, 3, 4, 5, 6, 7, 8].forEach((index) => {
            const { compute } = this.pipelines[index];
            if (index === 6 && !autoRange) return;
            if (index === 8 && !normals) return;
            Object.entries(params).forEach(([name, value]) =>
                compute.setParameter(name, value as number | Texture | StorageBuffer)
            );
            compute.setParameter('rawInput', index === 6 || index === 8 ? this.texture : this.dummy);
            compute.setParameter(
                'rawDepth',
                index === 8 ? this.normalTexture : index === 6 ? this.dummy : this.texture
            );
            if (index === 0 || index === 3) compute.setupDispatch(Math.min(groups, 65535), Math.ceil(groups / 65535));
            else if (index === 1) compute.setupDispatch(Math.ceil(this.tiles / 128));
            else if (index === 7 || index === 9) compute.setupDispatch(1);
            else if (index === 5 || index === 6 || index === 8)
                compute.setupDispatch(Math.ceil(width / 8), Math.ceil(height / 8));
            else compute.setupDispatch(params.tilesX, params.tilesY);
            this.device.computeDispatch([compute], `Depth-${index}`);
        });
        if (!this.pending) {
            this.pending = this.stats
                .read()
                .then((data) => {
                    if (this.destroyed) return;
                    this.checkedVersion = version;
                    const values = new Uint32Array(data.buffer, data.byteOffset, 6);
                    const needed = values[0];
                    const floats = new Float32Array(data.buffer, data.byteOffset, 6);
                    this.displayRange = [floats[4], floats[5]];
                    this.validPixels = values[3];
                    this.ready = needed <= this.listCapacity;
                    if (this.ready) this.notifiedError = null;
                    if (!this.ready) {
                        const max = Math.floor((128 * 1024 * 1024) / 8);
                        const next = Math.min(2 ** Math.ceil(Math.log2(needed)), max);
                        if (next < needed) {
                            this.fail(
                                new Error(
                                    'Depth tile list exceeds the 128 MiB working-buffer budget. Reduce resolution or raise filtering thresholds.'
                                )
                            );
                            return;
                        }
                        this.nodes.destroy();
                        this.listCapacity = next;
                        this.nodes = new StorageBuffer(this.device, next * 8);
                        this.scene.forceRender = true;
                    }
                })
                .catch((error) => {
                    this.fail(error instanceof Error ? error : new Error(String(error)));
                    this.ready = false;
                })
                .finally(() => {
                    this.pending = null;
                    // A newer frame may have rendered while this check was in
                    // flight; make sure the viewport (not just settle()) retries
                    // the capacity check for it.
                    if (!this.destroyed && !this.error && this.checkedVersion !== this.version) {
                        this.scene.forceRender = true;
                    }
                });
        }
    }

    // Free the full-resolution diagnostic textures after an offscreen capture.
    // The next diagnostic frame recreates them at the viewport size.
    shrink() {
        if (this.texture && (this.texture.width > 1 || this.texture.height > 1)) {
            this.resize(1, 1);
        }
    }

    private fail(error: Error) {
        this.error = error;
        if (this.notifiedError !== error.message) {
            this.notifiedError = error.message;
            this.scene.events.invoke('showPopup', {
                type: 'error',
                header: 'Depth',
                message: error.message
            });
        }
    }

    async settle() {
        await this.pending;
        if (this.error) throw this.error;
        return this.ready && this.checkedVersion === this.version;
    }

    destroy() {
        this.destroyed = true;
        this.pipelines.forEach(({ compute, shader, format }) => {
            compute.destroy();
            shader.destroy();
            format.destroy();
        });
        this.texture?.destroy();
        this.normalTexture?.destroy();
        this.counts?.destroy();
        this.ranges?.destroy();
        this.nodes.destroy();
        this.stats.destroy();
        this.histogram.destroy();
        this.dummy.destroy();
    }
}

export { DepthRenderer, DEPTH_METHODS, normalizeDepthMethod };
export type { DepthInputs, DepthMethod };
