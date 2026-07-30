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

type SelectByRangeOptions = SplatValueOptions & {
    min: number;
    max: number;
    numBins: number;
    rangeStart: number;
    rangeEnd: number;
};

type Variant = {
    compute: Compute;
    bindGroupFormat: BindGroupFormat;
};

const WORKGROUP_SIZE = 256;

class SelectByRange {
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
            name: `SelectByRangeCompute-${bands}`,
            shaderLanguage: SHADERLANGUAGE_WGSL,
            cshader: /* wgsl */`
@group(0) @binding(0) var<storage, read_write> result: array<u32>;
${common.code}

fn selectedByRange(index: u32) -> bool {
    var value = 0.0;
    var selected = false;
    var visible = false;
    if (!computeSplatValue(index, &value, &selected, &visible) || !visible) { return false; }
    var normalized = 0.0;
    if (uniforms.maxValue != uniforms.minValue) {
        normalized = (value - uniforms.minValue) / (uniforms.maxValue - uniforms.minValue);
    }
    let bin = clamp(i32(normalized * f32(uniforms.numBins)), 0, uniforms.numBins - 1);
    return bin >= uniforms.rangeStart && bin <= uniforms.rangeEnd;
}

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3u) {
    let word = gid.x;
    let first = word * 4u;
    if (first >= uniforms.numSplats) { return; }
    var packed = 0u;
    for (var channel = 0u; channel < 4u; channel++) {
        if (selectedByRange(first + channel)) { packed |= 0xffu << (channel * 8u); }
    }
    result[word] = packed;
}`,
            computeBindGroupFormat: bindGroupFormat,
            computeUniformBufferFormats: { uniforms }
        } as any);
        const compute = new Compute(this.device, shader, `SelectByRangeCompute-${bands}`);
        variant = { compute, bindGroupFormat };
        this.variants.set(bands, variant);
        return variant;
    }

    async run(splat: Splat, mode: number, options: SelectByRangeOptions, bufferPool: BufferPool): Promise<Uint8Array> {
        const count = splat.resource.numSplats;
        const byteSize = maskByteSize(count);
        if (!this.output || this.output.byteSize !== byteSize) {
            this.output?.destroy();
            this.output = new StorageBuffer(this.device, byteSize, BUFFERUSAGE_COPY_DST | BUFFERUSAGE_COPY_SRC);
        }

        const variant = this.getVariant(splat.resource.shBands);
        variant.compute.setParameter('result', this.output);
        setSplatValueParameters(
            variant.compute,
            splat,
            mode,
            options,
            options.min,
            options.max,
            options.numBins,
            options.rangeStart,
            options.rangeEnd
        );
        const words = byteSize / 4;
        Compute.calcDispatchSize(Math.ceil(words / WORKGROUP_SIZE), this.dispatchSize);
        variant.compute.setupDispatch(this.dispatchSize.x, this.dispatchSize.y);
        this.device.computeDispatch([variant.compute], 'select-by-range');
        const data = bufferPool.acquire(byteSize);
        const readback = this.output.read(0, byteSize, data, false);
        (this.device as any).submit();
        return await readback as Uint8Array;
    }
}

export { SelectByRange };
export type { SelectByRangeOptions };
