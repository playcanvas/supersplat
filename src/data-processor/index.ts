import {
    SEMANTIC_POSITION,
    drawQuadWithShader,
    BoundingBox,
    GraphicsDevice,
    RenderTarget,
    ScopeSpace,
    Shader,
    ShaderUtils,
    BlendState
} from 'playcanvas';

import { BufferPool } from './buffer-pool';
import { CalcBound } from './calc-bound';
import { CalcHistogram, CalcHistogramOptions } from './calc-histogram';
import { ColorMatch } from './color-match';
import { Intersect, IntersectOptions } from './intersect';
import { SelectByRange, SelectByRangeOptions } from './select-by-range';
import { SplatValueOptions } from './splat-value-compute';
import { fragmentShader as blitFragmentShader, vertexShader as blitVertexShader } from '../shaders/blit-shader';
import { Splat } from '../splat';

const resolve = (scope: ScopeSpace, values: any) => {
    for (const key in values) {
        scope.resolve(key).setValue(values[key]);
    }
};

// gpu processor for splat data. methods are plain (no internal serialisation):
// callers that need ordering relative to other async work must run them inside
// a shared CommandQueue task. see src/command-queue.ts.
class DataProcessor {
    private device: GraphicsDevice;
    private copyShader: Shader;

    // shared pool of readback buffers used by GPU passes that hand bytes back
    // to the caller. Callers receive ownership and must call releaseMask() when
    // done.
    private bufferPool = new BufferPool();

    // instances
    private intersectImpl: Intersect;
    private calcBoundImpl: CalcBound;
    private calcHistogramImpl: CalcHistogram;
    private colorMatchImpl: ColorMatch;
    private selectByRangeImpl: SelectByRange;

    constructor(device: GraphicsDevice) {
        this.device = device;

        this.copyShader = ShaderUtils.createShader(device, {
            uniqueName: 'copyShader',
            attributes: {
                vertex_position: SEMANTIC_POSITION
            },
            vertexWGSL: blitVertexShader,
            fragmentWGSL: blitFragmentShader
        });

        // create instances
        this.intersectImpl = new Intersect(device);
        this.calcBoundImpl = new CalcBound(device);
        this.calcHistogramImpl = new CalcHistogram(device);
        this.colorMatchImpl = new ColorMatch(device);
        this.selectByRangeImpl = new SelectByRange(device);
    }

    // calculate the intersection of a mask canvas with splat centers.
    // returns an owned mask buffer the caller must release via releaseMask().
    intersect(options: IntersectOptions, splat: Splat) {
        return this.intersectImpl.run(options, splat, this.bufferPool);
    }

    // use gpu to calculate both selected and visible bounds in a single pass
    calcBound(splat: Splat, selectionBound: BoundingBox, localBound: BoundingBox): Promise<void> {
        return this.calcBoundImpl.run(splat, selectionBound, localBound);
    }

    // calculate histogram (bin counts + min/max) entirely on GPU
    calcHistogram(splat: Splat, mode: number, options?: CalcHistogramOptions) {
        return this.calcHistogramImpl.run(splat, mode, options);
    }

    // compute a per-splat byte mask (255 = in range and visible, 0 = not) for
    // the given histogram bucket range. mode matches the propMode dispatch in
    // src/shaders/splat-value-shader.ts (0..20 = built-in props, 21+N = f_rest_N).
    // returns an owned mask buffer the caller must release via releaseMask().
    selectByRange(splat: Splat, mode: number, options: SelectByRangeOptions) {
        return this.selectByRangeImpl.run(splat, mode, options, this.bufferPool);
    }

    // compare final, view-dependent splat colors on the GPU and return an
    // owned per-splat byte mask the caller must release via releaseMask().
    colorMatch(splat: Splat, index: number, threshold: number, options: SplatValueOptions) {
        return this.colorMatchImpl.run(splat, index, threshold, options, this.bufferPool);
    }

    // release a mask buffer returned by intersect(), selectByRange() or
    // colorMatch() so subsequent calls can reuse it without re-allocating.
    releaseMask(mask: Uint8Array) {
        this.bufferPool.release(mask);
    }

    copyRt(source: RenderTarget, dest: RenderTarget) {
        const { device } = this;

        resolve(device.scope, {
            srcTexture: source.colorBuffer
        });

        device.setBlendState(BlendState.NOBLEND);
        drawQuadWithShader(device, dest, this.copyShader);
    }
}

export { DataProcessor };
export type { IntersectOptions, CalcHistogramOptions, SelectByRangeOptions };
export { MaskOptions, RectOptions, SphereOptions, BoxOptions } from './intersect';
