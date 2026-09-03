import {
    BUFFERUSAGE_COPY_DST,
    BUFFERUSAGE_COPY_SRC,
    SHADERLANGUAGE_WGSL,
    SHADERSTAGE_COMPUTE,
    BindGroupFormat,
    BindStorageBufferFormat,
    BindUniformBufferFormat,
    Compute,
    GraphicsDevice,
    Shader,
    StorageBuffer,
    Vec2
} from 'playcanvas';

import { BufferPool } from './buffer-pool';
import { maskByteSize } from './histogram-config';
import {
    createSplatValueTextureFormats,
    createSplatValueUniformFormat,
    setSplatValueParameters,
    SplatValueOptions
} from './splat-value-compute';
import { computeSplatValueWGSL } from '../shaders/splat-value-shader';
import { Splat } from '../splat';

type Variant = {
    compute: Compute;
    bindGroupFormat: BindGroupFormat;
};

const WORKGROUP_SIZE = 256;

class ColorMatch {
    private readonly device: GraphicsDevice;
    private readonly variants = new Map<number, Variant>();
    private readonly dispatchSize = new Vec2();
    private output: StorageBuffer = null;

    constructor(device: GraphicsDevice) {
        this.device = device;
    }

    private getVariant(bands: number) {
        let variant = this.variants.get(bands);
        if (variant) return variant;

        const common = computeSplatValueWGSL(bands, 1);
        const uniforms = createSplatValueUniformFormat(this.device);
        const bindGroupFormat = new BindGroupFormat(this.device, [
            new BindStorageBufferFormat('result', SHADERSTAGE_COMPUTE),
            ...createSplatValueTextureFormats(bands),
            new BindUniformBufferFormat('uniforms', SHADERSTAGE_COMPUTE)
        ]);
        const shader = new Shader(this.device, {
            name: `ColorMatchCompute-${bands}`,
            shaderLanguage: SHADERLANGUAGE_WGSL,
            cshader: /* wgsl */`
@group(0) @binding(0) var<storage, read_write> result: array<u32>;
${common.code}

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) numWorkgroups: vec3u) {
    let word = gid.y * numWorkgroups.x * ${WORKGROUP_SIZE}u + gid.x;
    let first = word * 4u;
    if (first >= uniforms.numSplats) { return; }

    var reference: SplatValue;
    if (!readSplat(uniforms.colorMatchIndex, &reference)) {
        result[word] = 0u;
        return;
    }
    let referenceColor = clamp(readFinalColor(reference), vec3f(0.0), vec3f(1.0));

    var packed = 0u;
    for (var channel = 0u; channel < 4u; channel++) {
        var splat: SplatValue;
        if (readSplat(first + channel, &splat)) {
            let color = clamp(readFinalColor(splat), vec3f(0.0), vec3f(1.0));
            let difference = abs(color - referenceColor);
            if (all(difference <= vec3f(uniforms.colorMatchThreshold))) {
                packed |= 0xffu << (channel * 8u);
            }
        }
    }
    result[word] = packed;
}`,
            computeBindGroupFormat: bindGroupFormat,
            computeUniformBufferFormats: { uniforms }
        } as any);
        const compute = new Compute(this.device, shader, `ColorMatchCompute-${bands}`);
        variant = { compute, bindGroupFormat };
        this.variants.set(bands, variant);
        return variant;
    }

    async run(splat: Splat, index: number, threshold: number, options: SplatValueOptions, bufferPool: BufferPool): Promise<Uint8Array> {
        const count = splat.instances.count;
        const byteSize = maskByteSize(count);
        if (!this.output || this.output.byteSize !== byteSize) {
            this.output?.destroy();
            this.output = new StorageBuffer(this.device, byteSize, BUFFERUSAGE_COPY_DST | BUFFERUSAGE_COPY_SRC);
        }

        const variant = this.getVariant(splat.resource.shBands);
        variant.compute.setParameter('result', this.output);
        setSplatValueParameters(variant.compute, splat, 0, options);
        variant.compute.setParameter('colorMatchIndex', index);
        variant.compute.setParameter('colorMatchThreshold', threshold);
        const words = byteSize / 4;
        Compute.calcDispatchSize(Math.ceil(words / WORKGROUP_SIZE), this.dispatchSize);
        variant.compute.setupDispatch(this.dispatchSize.x, this.dispatchSize.y);
        this.device.computeDispatch([variant.compute], 'color-match');
        const data = bufferPool.acquire(byteSize);
        const readback = this.output.read(0, byteSize, data, false);
        (this.device as any).submit();
        return await readback as Uint8Array;
    }
}

export { ColorMatch };
