import {
    BUFFERUSAGE_COPY_DST,
    BUFFERUSAGE_COPY_SRC,
    PIXELFORMAT_RGBA8,
    SAMPLETYPE_FLOAT,
    SAMPLETYPE_UINT,
    SAMPLETYPE_UNFILTERABLE_FLOAT,
    SHADERLANGUAGE_WGSL,
    SHADERSTAGE_COMPUTE,
    UNIFORMTYPE_FLOAT,
    UNIFORMTYPE_INT,
    UNIFORMTYPE_MAT4,
    UNIFORMTYPE_UINT,
    UNIFORMTYPE_VEC2,
    UNIFORMTYPE_VEC4,
    BindGroupFormat,
    BindStorageBufferFormat,
    BindTextureFormat,
    BindUniformBufferFormat,
    Camera,
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
import { maskByteSize } from './histogram-config';
import { indexToUvWGSL, paletteMatrixWGSL } from '../shaders/palette-chunk';
import { Splat } from '../splat';

type MaskOptions = {
    mask: Texture;
};

type RectOptions = {
    rect: { x1: number, y1: number, x2: number, y2: number };
};

type SphereOptions = {
    // transform mapping the unit sphere (diameter 1) to world space; footprint
    // scales the splat extent tested against the volume (0 = center point)
    sphere: { transform: Mat4, footprint?: number };
};

type BoxOptions = {
    // transform mapping the unit cube (side 1) to world space; footprint
    // scales the splat extent tested against the volume (0 = center point)
    box: { transform: Mat4, footprint?: number };
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
    shapeInverse: mat4x4f,
    footprint: f32
}

@group(0) @binding(0) var<storage, read_write> result: array<u32>;
@group(0) @binding(1) var<storage, read> instanceSource: array<u32>;
@group(0) @binding(2) var<storage, read> instancePalette: array<u32>;
@group(0) @binding(3) var transformA: texture_2d<u32>;
@group(0) @binding(4) var transformB: texture_2d<f32>;
@group(0) @binding(5) var transformPalette: texture_2d<f32>;
@group(0) @binding(6) var maskTexture: texture_2d<f32>;
@group(0) @binding(7) var<uniform> uniforms: Uniforms;

${paletteMatrixWGSL}
${indexToUvWGSL('sourceCoord', 'uniforms.sourceWidth')}

fn rotationMatrix(qIn: vec4f) -> mat3x3f {
    let q = normalize(qIn);
    let x = q.x;
    let y = q.y;
    let z = q.z;
    let w = q.w;
    return mat3x3f(
        vec3f(1.0 - 2.0 * (y * y + z * z), 2.0 * (x * y + w * z), 2.0 * (x * z - w * y)),
        vec3f(2.0 * (x * y - w * z), 1.0 - 2.0 * (x * x + z * z), 2.0 * (y * z + w * x)),
        vec3f(2.0 * (x * z + w * y), 2.0 * (y * z - w * x), 1.0 - 2.0 * (x * x + y * y))
    );
}

// index is an instance; its geometry comes from the referenced source row
fn intersects(index: u32) -> bool {
    if (index >= uniforms.numSplats) { return false; }
    let uv = sourceCoord(instanceSource[index]);
    let a = textureLoad(transformA, uv, 0);
    let center = bitcast<vec3f>(a.xyz);
    let paletteIndex = instancePalette[index] & 0xffffu;
    let toWorld = uniforms.model * paletteMatrix(paletteIndex);
    let world = (toWorld * vec4f(center, 1.0)).xyz;
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
    if (uniforms.footprint <= 0.0) {
        // centers: the splat's center point against the volume
        if (uniforms.mode == 2) {
            return length(local) < 0.5;
        }
        return all(abs(local) <= vec3f(0.5));
    }

    // footprint: the splat's 3d ellipsoid (the rendered 2*sqrt(2)-sigma extent,
    // scaled by the footprint factor) against the volume. The test compares the
    // separation to the ellipsoid's extent along the approach direction - a
    // support-function bound that never misses a real overlap and only slightly
    // over-includes grazing contacts
    let b = textureLoad(transformB, uv, 0);
    let packedRotation = unpack2x16float(a.w);
    let rotation = vec4f(packedRotation, b.w, sqrt(max(0.0, 1.0 - dot(vec3f(packedRotation, b.w), vec3f(packedRotation, b.w)))));
    let m = uniforms.shapeInverse * toWorld;
    let basis = mat3x3f(m[0].xyz, m[1].xyz, m[2].xyz) * rotationMatrix(rotation) * mat3x3f(
        vec3f(b.x, 0.0, 0.0),
        vec3f(0.0, b.y, 0.0),
        vec3f(0.0, 0.0, b.z)
    ) * (uniforms.footprint * 2.8284271);

    // closest point of the shape to the center, in shape-local space
    var closest: vec3f;
    if (uniforms.mode == 2) {
        let len = length(local);
        if (len <= 0.5) { return true; }
        closest = local * (0.5 / len);
    } else {
        closest = clamp(local, vec3f(-0.5), vec3f(0.5));
        if (all(closest == local)) { return true; }
    }
    let d = local - closest;
    let dist = length(d);
    let extent = length(transpose(basis) * (d / dist));
    return dist <= extent;
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
    private readonly shaderProjection = new Mat4();
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
            new UniformFormat('shapeInverse', UNIFORMTYPE_MAT4),
            new UniformFormat('footprint', UNIFORMTYPE_FLOAT)
        ]);
        this.bindGroupFormat = new BindGroupFormat(device, [
            new BindStorageBufferFormat('result', SHADERSTAGE_COMPUTE),
            new BindStorageBufferFormat('instanceSource', SHADERSTAGE_COMPUTE, true),
            new BindStorageBufferFormat('instancePalette', SHADERSTAGE_COMPUTE, true),
            new BindTextureFormat('transformA', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_UINT, false),
            new BindTextureFormat('transformB', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_UNFILTERABLE_FLOAT, false),
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
        const count = splat.instances.count;
        const transformA = splat.resource.getTexture('transformA');
        const byteSize = maskByteSize(count);
        const outputWords = byteSize / 4;
        if (!this.output || this.output.byteSize !== byteSize) {
            this.output?.destroy();
            this.output = new StorageBuffer(this.device, byteSize, BUFFERUSAGE_COPY_DST | BUFFERUSAGE_COPY_SRC);
        }

        const camera = splat.scene.camera.camera;
        const projection = Camera.applyShaderProjectionTransform(
            camera.projectionMatrix, this.shaderProjection, false, this.device.isWebGPU
        );
        this.viewProjection.mul2(projection, camera.viewMatrix);
        const mask = (options as MaskOptions).mask;
        const rect = (options as RectOptions).rect;
        const sphere = (options as SphereOptions).sphere;
        const box = (options as BoxOptions).box;
        const mode = mask ? 0 : rect ? 1 : sphere ? 2 : 3;

        const shapeInverse = sphere ? shapeInvMat.copy(sphere.transform).invert() : box ? shapeInvMat.copy(box.transform).invert() : identityMat;

        this.compute.setParameter('result', this.output);
        this.compute.setParameter('instanceSource', splat.instances.instanceSource);
        this.compute.setParameter('instancePalette', splat.instances.instancePalette);
        this.compute.setParameter('transformA', transformA);
        this.compute.setParameter('transformB', splat.resource.getTexture('transformB'));
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
        this.compute.setParameter('footprint', sphere?.footprint ?? box?.footprint ?? 0);
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
