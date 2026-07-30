import {
    BUFFERUSAGE_COPY_DST,
    BUFFERUSAGE_COPY_SRC,
    SAMPLETYPE_FLOAT,
    SAMPLETYPE_UINT,
    SAMPLETYPE_UNFILTERABLE_FLOAT,
    SHADERLANGUAGE_WGSL,
    SHADERSTAGE_COMPUTE,
    UNIFORMTYPE_UINT,
    BindGroupFormat,
    BindStorageBufferFormat,
    BindTextureFormat,
    BindUniformBufferFormat,
    BoundingBox,
    Compute,
    GraphicsDevice,
    Shader,
    StorageBuffer,
    UniformBufferFormat,
    UniformFormat,
    Vec2,
    Vec3
} from 'playcanvas';

import { paletteMatrixWGSL } from '../shaders/palette-chunk';
import { Splat } from '../splat';

const WORKGROUP_SIZE = 256;
const selectedMin = new Vec3();
const selectedMax = new Vec3();
const visibleMin = new Vec3();
const visibleMax = new Vec3();

const shaderSource = /* wgsl */`
struct Uniforms {
    sourceWidth: u32,
    sourceHeight: u32,
    numSplats: u32
}

@group(0) @binding(0) var<storage, read_write> bounds: array<vec4f>;
@group(0) @binding(1) var transformA: texture_2d<u32>;
@group(0) @binding(2) var splatTransform: texture_2d<u32>;
@group(0) @binding(3) var transformPalette: texture_2d<f32>;
@group(0) @binding(4) var splatState: texture_2d<f32>;
@group(0) @binding(5) var<uniform> uniforms: Uniforms;

${paletteMatrixWGSL}

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3u) {
    let x = gid.x;
    if (x >= uniforms.sourceWidth) { return; }
    var selMin = vec3f(1e6);
    var selMax = vec3f(-1e6);
    var visMin = vec3f(1e6);
    var visMax = vec3f(-1e6);
    for (var y = 0u; y < uniforms.sourceHeight; y++) {
        let index = x + y * uniforms.sourceWidth;
        if (index >= uniforms.numSplats) { break; }
        let uv = vec2i(i32(x), i32(y));
        let state = u32(textureLoad(splatState, uv, 0).r * 255.0 + 0.5);
        if ((state & 4u) != 0u) { continue; }
        var center = bitcast<vec3f>(textureLoad(transformA, uv, 0).xyz);
        let paletteIndex = textureLoad(splatTransform, uv, 0).r;
        center = (paletteMatrix(paletteIndex) * vec4f(center, 1.0)).xyz;
        let finite = abs(center) <= vec3f(1e30);
        let safeMin = select(vec3f(1e6), center, finite);
        let safeMax = select(visMax, center, finite);
        visMin = min(visMin, safeMin);
        visMax = max(visMax, safeMax);
        if (state == 1u) {
            selMin = min(selMin, safeMin);
            selMax = max(selMax, select(selMax, center, finite));
        }
    }
    let base = x * 4u;
    bounds[base] = vec4f(selMin, 0.0);
    bounds[base + 1u] = vec4f(selMax, 0.0);
    bounds[base + 2u] = vec4f(visMin, 0.0);
    bounds[base + 3u] = vec4f(visMax, 0.0);
}`;

class CalcBound {
    private readonly device: GraphicsDevice;
    private readonly compute: Compute;
    private readonly bindGroupFormat: BindGroupFormat;
    private readonly dispatchSize = new Vec2();
    private output: StorageBuffer = null;
    private data: Float32Array = null;

    constructor(device: GraphicsDevice) {
        this.device = device;
        const uniforms = new UniformBufferFormat(device, [
            new UniformFormat('sourceWidth', UNIFORMTYPE_UINT),
            new UniformFormat('sourceHeight', UNIFORMTYPE_UINT),
            new UniformFormat('numSplats', UNIFORMTYPE_UINT)
        ]);
        this.bindGroupFormat = new BindGroupFormat(device, [
            new BindStorageBufferFormat('bounds', SHADERSTAGE_COMPUTE),
            new BindTextureFormat('transformA', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_UINT, false),
            new BindTextureFormat('splatTransform', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_UINT, false),
            new BindTextureFormat('transformPalette', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_UNFILTERABLE_FLOAT, false),
            new BindTextureFormat('splatState', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_FLOAT, false),
            new BindUniformBufferFormat('uniforms', SHADERSTAGE_COMPUTE)
        ]);
        const shader = new Shader(device, {
            name: 'CalcBoundCompute',
            shaderLanguage: SHADERLANGUAGE_WGSL,
            cshader: shaderSource,
            computeBindGroupFormat: this.bindGroupFormat,
            computeUniformBufferFormats: { uniforms }
        } as any);
        this.compute = new Compute(device, shader, 'CalcBoundCompute');
    }

    async run(splat: Splat, selectionBound: BoundingBox, localBound: BoundingBox): Promise<void> {
        const transformA = splat.resource.getTexture('transformA');
        const byteSize = transformA.width * 4 * 16;
        if (!this.output || this.output.byteSize !== byteSize) {
            this.output?.destroy();
            this.output = new StorageBuffer(this.device, byteSize, BUFFERUSAGE_COPY_DST | BUFFERUSAGE_COPY_SRC);
            this.data = new Float32Array(byteSize / 4);
        }
        this.compute.setParameter('bounds', this.output);
        this.compute.setParameter('transformA', transformA);
        this.compute.setParameter('splatTransform', splat.transformTexture);
        this.compute.setParameter('transformPalette', splat.transformPalette.texture);
        this.compute.setParameter('splatState', splat.stateTexture);
        this.compute.setParameter('sourceWidth', transformA.width);
        this.compute.setParameter('sourceHeight', transformA.height);
        this.compute.setParameter('numSplats', splat.resource.numSplats);
        Compute.calcDispatchSize(Math.ceil(transformA.width / WORKGROUP_SIZE), this.dispatchSize);
        this.compute.setupDispatch(this.dispatchSize.x, this.dispatchSize.y);
        this.device.computeDispatch([this.compute], 'calc-bound');
        const readback = this.output.read(0, byteSize, this.data, false);
        (this.device as any).submit();
        const data = await readback as Float32Array;

        selectedMin.set(Infinity, Infinity, Infinity);
        selectedMax.set(-Infinity, -Infinity, -Infinity);
        visibleMin.set(Infinity, Infinity, Infinity);
        visibleMax.set(-Infinity, -Infinity, -Infinity);
        for (let x = 0; x < transformA.width; x++) {
            const base = x * 16;
            selectedMin.x = Math.min(selectedMin.x, data[base]);
            selectedMin.y = Math.min(selectedMin.y, data[base + 1]);
            selectedMin.z = Math.min(selectedMin.z, data[base + 2]);
            selectedMax.x = Math.max(selectedMax.x, data[base + 4]);
            selectedMax.y = Math.max(selectedMax.y, data[base + 5]);
            selectedMax.z = Math.max(selectedMax.z, data[base + 6]);
            visibleMin.x = Math.min(visibleMin.x, data[base + 8]);
            visibleMin.y = Math.min(visibleMin.y, data[base + 9]);
            visibleMin.z = Math.min(visibleMin.z, data[base + 10]);
            visibleMax.x = Math.max(visibleMax.x, data[base + 12]);
            visibleMax.y = Math.max(visibleMax.y, data[base + 13]);
            visibleMax.z = Math.max(visibleMax.z, data[base + 14]);
        }
        selectionBound.setMinMax(selectedMin, selectedMax);
        localBound.setMinMax(visibleMin, visibleMax);
    }
}

export { CalcBound };
