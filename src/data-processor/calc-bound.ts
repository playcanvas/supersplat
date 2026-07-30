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

import { indexToUvWGSL, paletteMatrixWGSL } from '../shaders/palette-chunk';
import { Splat } from '../splat';

const WORKGROUP_SIZE = 256;
const selectedMin = new Vec3();
const selectedMax = new Vec3();
const visibleMin = new Vec3();
const visibleMax = new Vec3();

// fixed reduction width: each thread strides over the instance list and writes
// one partial, so the readback is a constant size regardless of scene size
const NUM_THREADS = WORKGROUP_SIZE * 64;

const shaderSource = /* wgsl */`
struct Uniforms {
    sourceWidth: u32,
    numSplats: u32
}

@group(0) @binding(0) var<storage, read_write> bounds: array<vec4f>;
@group(0) @binding(1) var<storage, read> instanceSource: array<u32>;
@group(0) @binding(2) var<storage, read> instanceFlags: array<u32>;
@group(0) @binding(3) var<storage, read> instancePalette: array<u32>;
@group(0) @binding(4) var transformA: texture_2d<u32>;
@group(0) @binding(5) var transformPalette: texture_2d<f32>;
@group(0) @binding(6) var<uniform> uniforms: Uniforms;

${indexToUvWGSL('sourceCoord', 'uniforms.sourceWidth')}
${paletteMatrixWGSL}

fn instanceFlagByte(instance: u32) -> u32 {
    return (instanceFlags[instance >> 2u] >> ((instance & 3u) * 8u)) & 0xffu;
}

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) numWorkgroups: vec3u) {
    let thread = gid.y * numWorkgroups.x * ${WORKGROUP_SIZE}u + gid.x;
    if (thread >= ${NUM_THREADS}u) { return; }
    var selMin = vec3f(1e6);
    var selMax = vec3f(-1e6);
    var visMin = vec3f(1e6);
    var visMax = vec3f(-1e6);
    for (var i = thread; i < uniforms.numSplats; i += ${NUM_THREADS}u) {
        let state = instanceFlagByte(i);
        let uv = sourceCoord(instanceSource[i]);
        var center = bitcast<vec3f>(textureLoad(transformA, uv, 0).xyz);
        center = (paletteMatrix(instancePalette[i] & 0xffffu) * vec4f(center, 1.0)).xyz;
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
    let base = thread * 4u;
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
            new UniformFormat('numSplats', UNIFORMTYPE_UINT)
        ]);
        this.bindGroupFormat = new BindGroupFormat(device, [
            new BindStorageBufferFormat('bounds', SHADERSTAGE_COMPUTE),
            new BindStorageBufferFormat('instanceSource', SHADERSTAGE_COMPUTE, true),
            new BindStorageBufferFormat('instanceFlags', SHADERSTAGE_COMPUTE, true),
            new BindStorageBufferFormat('instancePalette', SHADERSTAGE_COMPUTE, true),
            new BindTextureFormat('transformA', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_UINT, false),
            new BindTextureFormat('transformPalette', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_UNFILTERABLE_FLOAT, false),
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
        // 4 vec4 partials per thread, and the thread count is fixed
        const byteSize = NUM_THREADS * 4 * 16;
        if (!this.output) {
            this.output = new StorageBuffer(this.device, byteSize, BUFFERUSAGE_COPY_DST | BUFFERUSAGE_COPY_SRC);
            this.data = new Float32Array(byteSize / 4);
        }
        this.compute.setParameter('bounds', this.output);
        this.compute.setParameter('instanceSource', splat.instances.instanceSource);
        this.compute.setParameter('instanceFlags', splat.instances.instanceFlags);
        this.compute.setParameter('instancePalette', splat.instances.instancePalette);
        this.compute.setParameter('transformA', transformA);
        this.compute.setParameter('transformPalette', splat.transformPalette.texture);
        this.compute.setParameter('sourceWidth', transformA.width);
        this.compute.setParameter('numSplats', splat.instances.count);
        Compute.calcDispatchSize(NUM_THREADS / WORKGROUP_SIZE, this.dispatchSize);
        this.compute.setupDispatch(this.dispatchSize.x, this.dispatchSize.y);
        this.device.computeDispatch([this.compute], 'calc-bound');
        const readback = this.output.read(0, byteSize, this.data, false);
        (this.device as any).submit();
        const data = await readback as Float32Array;

        selectedMin.set(Infinity, Infinity, Infinity);
        selectedMax.set(-Infinity, -Infinity, -Infinity);
        visibleMin.set(Infinity, Infinity, Infinity);
        visibleMax.set(-Infinity, -Infinity, -Infinity);
        for (let thread = 0; thread < NUM_THREADS; thread++) {
            const base = thread * 16;
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
