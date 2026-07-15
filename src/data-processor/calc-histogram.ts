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

import { NUM_BINS } from './histogram-config';
import {
    createSplatValueTextureFormats,
    createSplatValueUniformFormat,
    setSplatValueParameters,
    SplatValueOptions
} from './splat-value-compute';
import { computeSplatValueWGSL } from '../shaders/splat-value-shader';
import { Splat } from '../splat';

type CalcHistogramOptions = SplatValueOptions;
type CalcHistogramResult = {
    selected: Float32Array;
    unselected: Float32Array;
    min: number;
    max: number;
    numValues: number;
};

type Variant = {
    minMaxCompute: Compute;
    binCompute: Compute;
    minMaxBindGroupFormat: BindGroupFormat;
    binBindGroupFormat: BindGroupFormat;
};

const WORKGROUP_SIZE = 256;
const floatBits = new Float32Array(1);
const uintBits = new Uint32Array(floatBits.buffer);

const floatToOrdered = (value: number) => {
    floatBits[0] = value;
    const bits = uintBits[0];
    return (bits & 0x80000000) === 0 ? (bits ^ 0x80000000) >>> 0 : (~bits) >>> 0;
};

const orderedToFloat = (value: number) => {
    uintBits[0] = (value & 0x80000000) !== 0 ? (value ^ 0x80000000) >>> 0 : (~value) >>> 0;
    return floatBits[0];
};

class CalcHistogram {
    private readonly device: GraphicsDevice;
    private readonly variants = new Map<number, Variant>();
    private readonly minMax: StorageBuffer;
    private readonly bins: StorageBuffer;
    private readonly dispatchSize = new Vec2();
    private readonly minMaxInit = new Uint32Array([floatToOrdered(1e30), floatToOrdered(-1e30)]);
    private readonly binInit = new Uint32Array(NUM_BINS * 2);
    private readonly minMaxData = new Uint32Array(2);
    private readonly binData = new Uint32Array(NUM_BINS * 2);

    constructor(device: GraphicsDevice) {
        this.device = device;
        this.minMax = new StorageBuffer(device, 8, BUFFERUSAGE_COPY_DST | BUFFERUSAGE_COPY_SRC);
        this.bins = new StorageBuffer(device, NUM_BINS * 8, BUFFERUSAGE_COPY_DST | BUFFERUSAGE_COPY_SRC);
    }

    private getVariant(bands: number) {
        let variant = this.variants.get(bands);
        if (variant) return variant;

        const minMaxCommon = computeSplatValueWGSL(bands, 1);
        const minMaxUniforms = createSplatValueUniformFormat(this.device);
        const minMaxBindGroupFormat = new BindGroupFormat(this.device, [
            new BindStorageBufferFormat('minMax', SHADERSTAGE_COMPUTE),
            ...createSplatValueTextureFormats(bands),
            new BindUniformBufferFormat('uniforms', SHADERSTAGE_COMPUTE)
        ]);
        const minMaxShader = new Shader(this.device, {
            name: `HistogramMinMaxCompute-${bands}`,
            shaderLanguage: SHADERLANGUAGE_WGSL,
            cshader: /* wgsl */`
@group(0) @binding(0) var<storage, read_write> minMax: array<atomic<u32>>;
${minMaxCommon.code}

fn floatToOrdered(value: f32) -> u32 {
    let bits = bitcast<u32>(value);
    return select(~bits, bits ^ 0x80000000u, (bits & 0x80000000u) == 0u);
}

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3u) {
    var value = 0.0;
    var selected = false;
    var visible = false;
    if (computeSplatValue(gid.x, &value, &selected, &visible) && visible && value == value) {
        let ordered = floatToOrdered(value);
        atomicMin(&minMax[0], ordered);
        atomicMax(&minMax[1], ordered);
    }
}`,
            computeBindGroupFormat: minMaxBindGroupFormat,
            computeUniformBufferFormats: { uniforms: minMaxUniforms }
        } as any);
        const minMaxCompute = new Compute(this.device, minMaxShader, `HistogramMinMaxCompute-${bands}`);

        const binCommon = computeSplatValueWGSL(bands, 2);
        const binUniforms = createSplatValueUniformFormat(this.device);
        const binBindGroupFormat = new BindGroupFormat(this.device, [
            new BindStorageBufferFormat('minMax', SHADERSTAGE_COMPUTE, true),
            new BindStorageBufferFormat('bins', SHADERSTAGE_COMPUTE),
            ...createSplatValueTextureFormats(bands),
            new BindUniformBufferFormat('uniforms', SHADERSTAGE_COMPUTE)
        ]);
        const binShader = new Shader(this.device, {
            name: `HistogramBinsCompute-${bands}`,
            shaderLanguage: SHADERLANGUAGE_WGSL,
            cshader: /* wgsl */`
@group(0) @binding(0) var<storage, read> minMax: array<u32>;
@group(0) @binding(1) var<storage, read_write> bins: array<atomic<u32>>;
${binCommon.code}

fn orderedToFloat(value: u32) -> f32 {
    let bits = select(~value, value ^ 0x80000000u, (value & 0x80000000u) != 0u);
    return bitcast<f32>(bits);
}

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3u) {
    var value = 0.0;
    var selected = false;
    var visible = false;
    if (!computeSplatValue(gid.x, &value, &selected, &visible) || !visible) { return; }
    let minValue = orderedToFloat(minMax[0]);
    let maxValue = orderedToFloat(minMax[1]);
    var normalized = 0.0;
    if (maxValue != minValue) { normalized = (value - minValue) / (maxValue - minValue); }
    let bin = u32(clamp(i32(normalized * f32(${NUM_BINS})), 0, ${NUM_BINS - 1}));
    let offset = select(${NUM_BINS}u, 0u, selected);
    atomicAdd(&bins[offset + bin], 1u);
}`,
            computeBindGroupFormat: binBindGroupFormat,
            computeUniformBufferFormats: { uniforms: binUniforms }
        } as any);
        const binCompute = new Compute(this.device, binShader, `HistogramBinsCompute-${bands}`);

        variant = { minMaxCompute, binCompute, minMaxBindGroupFormat, binBindGroupFormat };
        this.variants.set(bands, variant);
        return variant;
    }

    async run(splat: Splat, mode: number, options?: CalcHistogramOptions): Promise<CalcHistogramResult> {
        const count = splat.splatData.numSplats;
        const variant = this.getVariant(splat.resource.shBands);
        this.minMax.write(0, this.minMaxInit, 0, 2);
        this.bins.write(0, this.binInit, 0, this.binInit.length);

        variant.minMaxCompute.setParameter('minMax', this.minMax);
        setSplatValueParameters(variant.minMaxCompute, splat, mode, options);
        Compute.calcDispatchSize(Math.ceil(count / WORKGROUP_SIZE), this.dispatchSize);
        variant.minMaxCompute.setupDispatch(this.dispatchSize.x, this.dispatchSize.y);
        this.device.computeDispatch([variant.minMaxCompute], 'histogram-min-max');

        variant.binCompute.setParameter('minMax', this.minMax);
        variant.binCompute.setParameter('bins', this.bins);
        setSplatValueParameters(variant.binCompute, splat, mode, options, 0, 0, NUM_BINS);
        variant.binCompute.setupDispatch(this.dispatchSize.x, this.dispatchSize.y);
        this.device.computeDispatch([variant.binCompute], 'histogram-bins');
        const readbacks = [
            this.minMax.read(0, 8, this.minMaxData, false),
            this.bins.read(0, this.bins.byteSize, this.binData, false)
        ];
        (this.device as any).submit();
        await Promise.all(readbacks);
        let min = orderedToFloat(this.minMaxData[0]);
        let max = orderedToFloat(this.minMaxData[1]);
        if (min > max) {
            min = 0;
            max = 0;
        }
        const selected = new Float32Array(NUM_BINS);
        const unselected = new Float32Array(NUM_BINS);
        let numValues = 0;
        for (let i = 0; i < NUM_BINS; i++) {
            selected[i] = this.binData[i];
            unselected[i] = this.binData[NUM_BINS + i];
            numValues += selected[i] + unselected[i];
        }
        return { selected, unselected, min, max, numValues };
    }

    destroy() {
        this.minMax.destroy();
        this.bins.destroy();
        this.variants.clear();
    }
}

export { CalcHistogram };
export type { CalcHistogramOptions, CalcHistogramResult };
