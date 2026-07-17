import {
    BUFFERUSAGE_COPY_DST,
    BUFFERUSAGE_COPY_SRC,
    PIXELFORMAT_RGBA8,
    SAMPLETYPE_FLOAT,
    SAMPLETYPE_UINT,
    SAMPLETYPE_UNFILTERABLE_FLOAT,
    SHADERLANGUAGE_WGSL,
    SHADERSTAGE_COMPUTE,
    UNIFORMTYPE_INT,
    UNIFORMTYPE_MAT4,
    UNIFORMTYPE_UINT,
    UNIFORMTYPE_VEC2,
    UNIFORMTYPE_VEC4,
    BindGroupFormat,
    BindStorageBufferFormat,
    BindTextureFormat,
    BindUniformBufferFormat,
    Compute,
    GraphicsDevice,
    Mat4,
    Shader,
    StorageBuffer,
    Texture,
    UniformBufferFormat,
    UniformFormat,
    Vec2
} from 'playcanvas';

import { BufferPool } from './buffer-pool';
import { packedMaskHeight, packedMaskWidth } from './histogram-config';
import { Splat } from '../splat';

type MaskOptions = {
    mask: Texture;
};

type RectOptions = {
    rect: { x1: number, y1: number, x2: number, y2: number };
};

type SphereOptions = {
    // transform mapping the unit sphere (diameter 1) to world space
    sphere: { transform: Mat4 };
};

type BoxOptions = {
    // transform mapping the unit cube (side 1) to world space
    box: { transform: Mat4 };
};

type IntersectOptions = MaskOptions | RectOptions | SphereOptions | BoxOptions;

const shapeInvMat = new Mat4();
const identityMat = new Mat4();

const WORKGROUP_SIZE = 256;

const shaderSource = /* wgsl */`
struct Uniforms {
    sourceWidth: u32,
    numSplats: u32,
    outputWords: u32,
    mode: i32,
    model: mat4x4f,
    viewProjection: mat4x4f,
    maskSize: vec2f,
    rect: vec4f,
    shapeInverse: mat4x4f
}

@group(0) @binding(0) var<storage, read_write> result: array<u32>;
@group(0) @binding(1) var transformA: texture_2d<u32>;
@group(0) @binding(2) var splatTransform: texture_2d<u32>;
@group(0) @binding(3) var transformPalette: texture_2d<f32>;
@group(0) @binding(4) var maskTexture: texture_2d<f32>;
@group(0) @binding(5) var<uniform> uniforms: Uniforms;

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

fn intersects(index: u32) -> bool {
    if (index >= uniforms.numSplats) { return false; }
    let uv = vec2i(i32(index % uniforms.sourceWidth), i32(index / uniforms.sourceWidth));
    let center = bitcast<vec3f>(textureLoad(transformA, uv, 0).xyz);
    let paletteIndex = textureLoad(splatTransform, uv, 0).r;
    let world = (uniforms.model * paletteMatrix(paletteIndex) * vec4f(center, 1.0)).xyz;
    if (uniforms.mode <= 1) {
        let clip = uniforms.viewProjection * vec4f(world, 1.0);
        if (clip.w <= 0.0) { return false; }
        let ndc = clip.xyz / clip.w;
        if (abs(ndc.x) > 1.0 || abs(ndc.y) > 1.0 || ndc.z < 0.0 || ndc.z > 1.0) { return false; }
        if (uniforms.mode == 0) {
            let maskUv = vec2i((ndc.xy * vec2f(0.5, -0.5) + 0.5) * uniforms.maskSize);
            return textureLoad(maskTexture, maskUv, 0).a >= 1.0;
        }
        let point = ndc.xy * vec2f(1.0, -1.0);
        return all(point > uniforms.rect.xy) && all(point < uniforms.rect.zw);
    }
    let local = (uniforms.shapeInverse * vec4f(world, 1.0)).xyz;
    if (uniforms.mode == 2) {
        return length(local) < 0.5;
    }
    return all(abs(local) <= vec3f(0.5));
}

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3u) {
    let word = gid.x;
    if (word >= uniforms.outputWords) { return; }
    let first = word * 4u;
    var packed = 0u;
    for (var channel = 0u; channel < 4u; channel++) {
        if (intersects(first + channel)) {
            packed |= 0xffu << (channel * 8u);
        }
    }
    result[word] = packed;
}`;

class Intersect {
    private readonly device: GraphicsDevice;
    private readonly dummyTexture: Texture;
    private readonly viewProjection = new Mat4();
    private readonly compute: Compute;
    private readonly bindGroupFormat: BindGroupFormat;
    private readonly dispatchSize = new Vec2();
    private output: StorageBuffer = null;

    constructor(device: GraphicsDevice) {
        this.device = device;
        this.dummyTexture = new Texture(device, { width: 1, height: 1, format: PIXELFORMAT_RGBA8 });
        const uniforms = new UniformBufferFormat(device, [
            new UniformFormat('sourceWidth', UNIFORMTYPE_UINT),
            new UniformFormat('numSplats', UNIFORMTYPE_UINT),
            new UniformFormat('outputWords', UNIFORMTYPE_UINT),
            new UniformFormat('mode', UNIFORMTYPE_INT),
            new UniformFormat('model', UNIFORMTYPE_MAT4),
            new UniformFormat('viewProjection', UNIFORMTYPE_MAT4),
            new UniformFormat('maskSize', UNIFORMTYPE_VEC2),
            new UniformFormat('rect', UNIFORMTYPE_VEC4),
            new UniformFormat('shapeInverse', UNIFORMTYPE_MAT4)
        ]);
        this.bindGroupFormat = new BindGroupFormat(device, [
            new BindStorageBufferFormat('result', SHADERSTAGE_COMPUTE),
            new BindTextureFormat('transformA', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_UINT, false),
            new BindTextureFormat('splatTransform', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_UINT, false),
            new BindTextureFormat('transformPalette', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_UNFILTERABLE_FLOAT, false),
            new BindTextureFormat('maskTexture', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_FLOAT, false),
            new BindUniformBufferFormat('uniforms', SHADERSTAGE_COMPUTE)
        ]);
        const shader = new Shader(device, {
            name: 'IntersectCompute',
            shaderLanguage: SHADERLANGUAGE_WGSL,
            cshader: shaderSource,
            computeBindGroupFormat: this.bindGroupFormat,
            computeUniformBufferFormats: { uniforms }
        } as any);
        this.compute = new Compute(device, shader, 'IntersectCompute');
    }

    async run(options: IntersectOptions, splat: Splat, bufferPool: BufferPool): Promise<Uint8Array> {
        const count = splat.resource.numSplats;
        const transformA = splat.resource.getTexture('transformA');
        const resultWidth = packedMaskWidth(transformA.width);
        const resultHeight = packedMaskHeight(resultWidth, count);
        const byteSize = resultWidth * resultHeight * 4;
        const outputWords = byteSize / 4;
        if (!this.output || this.output.byteSize !== byteSize) {
            this.output?.destroy();
            this.output = new StorageBuffer(this.device, byteSize, BUFFERUSAGE_COPY_DST | BUFFERUSAGE_COPY_SRC);
        }

        const camera = splat.scene.camera.camera;
        this.viewProjection.mul2(camera.projectionMatrix, camera.viewMatrix);
        const mask = (options as MaskOptions).mask;
        const rect = (options as RectOptions).rect;
        const sphere = (options as SphereOptions).sphere;
        const box = (options as BoxOptions).box;
        const mode = mask ? 0 : rect ? 1 : sphere ? 2 : 3;

        const shapeInverse = sphere ? shapeInvMat.copy(sphere.transform).invert() : box ? shapeInvMat.copy(box.transform).invert() : identityMat;

        this.compute.setParameter('result', this.output);
        this.compute.setParameter('transformA', transformA);
        this.compute.setParameter('splatTransform', splat.transformTexture);
        this.compute.setParameter('transformPalette', splat.transformPalette.texture);
        this.compute.setParameter('maskTexture', mask ?? this.dummyTexture);
        this.compute.setParameter('sourceWidth', transformA.width);
        this.compute.setParameter('numSplats', count);
        this.compute.setParameter('outputWords', outputWords);
        this.compute.setParameter('mode', mode);
        this.compute.setParameter('model', splat.entity.getWorldTransform().data);
        this.compute.setParameter('viewProjection', this.viewProjection.data);
        this.compute.setParameter('maskSize', mask ? [mask.width, mask.height] : [0, 0]);
        this.compute.setParameter('rect', rect ? [rect.x1 * 2 - 1, rect.y1 * 2 - 1, rect.x2 * 2 - 1, rect.y2 * 2 - 1] : [0, 0, 0, 0]);
        this.compute.setParameter('shapeInverse', shapeInverse.data);
        Compute.calcDispatchSize(Math.ceil(outputWords / WORKGROUP_SIZE), this.dispatchSize);
        this.compute.setupDispatch(this.dispatchSize.x, this.dispatchSize.y);
        this.device.computeDispatch([this.compute], 'intersect');
        const data = bufferPool.acquire(byteSize);
        const readback = this.output.read(0, byteSize, data, false);
        (this.device as any).submit();
        return await readback as Uint8Array;
    }
}

export { Intersect, IntersectOptions, MaskOptions, RectOptions, SphereOptions, BoxOptions };
