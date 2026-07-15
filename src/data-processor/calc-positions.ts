import {
    BUFFERUSAGE_COPY_DST,
    BUFFERUSAGE_COPY_SRC,
    SAMPLETYPE_UINT,
    SAMPLETYPE_UNFILTERABLE_FLOAT,
    SHADERLANGUAGE_WGSL,
    SHADERSTAGE_COMPUTE,
    UNIFORMTYPE_UINT,
    BindGroupFormat,
    BindStorageBufferFormat,
    BindTextureFormat,
    BindUniformBufferFormat,
    Compute,
    GraphicsDevice,
    Shader,
    StorageBuffer,
    UniformBufferFormat,
    UniformFormat,
    Vec2
} from 'playcanvas';

import { Splat } from '../splat';

const WORKGROUP_SIZE = 256;

const shaderSource = /* wgsl */`
struct Uniforms {
    sourceWidth: u32,
    numSplats: u32
}

@group(0) @binding(0) var<storage, read_write> positions: array<vec4f>;
@group(0) @binding(1) var transformA: texture_2d<u32>;
@group(0) @binding(2) var splatTransform: texture_2d<u32>;
@group(0) @binding(3) var transformPalette: texture_2d<f32>;
@group(0) @binding(4) var<uniform> uniforms: Uniforms;

fn paletteMatrix(index: u32) -> mat4x4f {
    if (index == 0u) {
        return mat4x4f(
            vec4f(1.0, 0.0, 0.0, 0.0), vec4f(0.0, 1.0, 0.0, 0.0),
            vec4f(0.0, 0.0, 1.0, 0.0), vec4f(0.0, 0.0, 0.0, 1.0)
        );
    }
    let x = i32(index % 512u) * 3;
    let y = i32(index / 512u);
    let r0 = textureLoad(transformPalette, vec2i(x, y), 0);
    let r1 = textureLoad(transformPalette, vec2i(x + 1, y), 0);
    let r2 = textureLoad(transformPalette, vec2i(x + 2, y), 0);
    return mat4x4f(
        vec4f(r0.x, r1.x, r2.x, 0.0), vec4f(r0.y, r1.y, r2.y, 0.0),
        vec4f(r0.z, r1.z, r2.z, 0.0), vec4f(r0.w, r1.w, r2.w, 1.0)
    );
}

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3u) {
    let index = gid.x;
    if (index >= uniforms.numSplats) { return; }
    let uv = vec2i(i32(index % uniforms.sourceWidth), i32(index / uniforms.sourceWidth));
    let center = bitcast<vec3f>(textureLoad(transformA, uv, 0).xyz);
    let paletteIndex = textureLoad(splatTransform, uv, 0).r;
    positions[index] = vec4f((paletteMatrix(paletteIndex) * vec4f(center, 1.0)).xyz, 0.0);
}`;

class CalcPositions {
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
            new BindStorageBufferFormat('positions', SHADERSTAGE_COMPUTE),
            new BindTextureFormat('transformA', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_UINT, false),
            new BindTextureFormat('splatTransform', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_UINT, false),
            new BindTextureFormat('transformPalette', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_UNFILTERABLE_FLOAT, false),
            new BindUniformBufferFormat('uniforms', SHADERSTAGE_COMPUTE)
        ]);
        const shader = new Shader(device, {
            name: 'CalcPositionsCompute',
            shaderLanguage: SHADERLANGUAGE_WGSL,
            cshader: shaderSource,
            computeBindGroupFormat: this.bindGroupFormat,
            computeUniformBufferFormats: { uniforms }
        } as any);
        this.compute = new Compute(device, shader, 'CalcPositionsCompute');
    }

    async run(splat: Splat): Promise<Float32Array> {
        const count = splat.splatData.numSplats;
        const byteSize = Math.max(16, count * 16);
        if (!this.output || this.output.byteSize !== byteSize) {
            this.output?.destroy();
            this.output = new StorageBuffer(this.device, byteSize, BUFFERUSAGE_COPY_DST | BUFFERUSAGE_COPY_SRC);
            this.data = new Float32Array(byteSize / 4);
        }

        const transformA = splat.resource.getTexture('transformA');
        this.compute.setParameter('positions', this.output);
        this.compute.setParameter('transformA', transformA);
        this.compute.setParameter('splatTransform', splat.transformTexture);
        this.compute.setParameter('transformPalette', splat.transformPalette.texture);
        this.compute.setParameter('sourceWidth', transformA.width);
        this.compute.setParameter('numSplats', count);
        Compute.calcDispatchSize(Math.ceil(count / WORKGROUP_SIZE), this.dispatchSize);
        this.compute.setupDispatch(this.dispatchSize.x, this.dispatchSize.y);
        this.device.computeDispatch([this.compute], 'calc-positions');
        const readback = this.output.read(0, byteSize, this.data, false);
        (this.device as any).submit();
        return await readback as Float32Array;
    }
}

export { CalcPositions };
