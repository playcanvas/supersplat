import {
    ADDRESS_CLAMP_TO_EDGE,
    BLENDEQUATION_ADD,
    BLENDMODE_ONE,
    PIXELFORMAT_RGBA32F,
    SEMANTIC_POSITION,
    drawQuadWithShader,
    BlendState,
    GraphicsDevice,
    Mat4,
    RenderTarget,
    ScopeSpace,
    Shader,
    ShaderUtils,
    Texture,
    Vec3
} from 'playcanvas';

import { drawPointsWithShader } from './draw-points';
import { GRID_DIM, NUM_BINS } from './histogram-config';
import {
    fullscreenVS,
    tileMinMaxFS,
    finalReduceFS,
    binVS,
    binFS
} from '../shaders/histogram-shaders';
import { Splat } from '../splat';

const identity = new Mat4();
const zeroVec3 = new Vec3();

// number of SH coefficients per RGB band, indexed by GSplatResource.shBands.
const SH_NUM_COEFFS: { [k: number]: number } = { 0: 0, 1: 3, 2: 8, 3: 15 };

type CalcHistogramOptions = {
    entityMatrix?: Mat4;
    viewMatrix?: Mat4;
    viewProjection?: Mat4;
    cameraPos?: Vec3;
    onScreenOnly?: boolean;
};

type CalcHistogramResult = {
    selected: Float32Array;     // length numBins
    unselected: Float32Array;   // length numBins
    min: number;
    max: number;
    numValues: number;
};

const resolve = (scope: ScopeSpace, values: any) => {
    for (const key in values) {
        scope.resolve(key).setValue(values[key]);
    }
};

const getShBands = (splat: Splat): number => {
    return (splat.entity.gsplat.instance.resource as any).shBands ?? 0;
};

class CalcHistogram {
    private device: GraphicsDevice;

    // shaders are compiled per SH_BANDS value so that each variant declares only
    // the SH samplers it actually reads. reduceShader has no SH dependence.
    private tileShaders: Map<number, Shader> = new Map();
    private binShaders: Map<number, Shader> = new Map();
    private reduceShader: Shader = null;

    private tileTex: Texture = null;
    private tileRT: RenderTarget = null;
    private minMaxTex: Texture = null;
    private minMaxRT: RenderTarget = null;
    private binTex: Texture = null;
    private binRT: RenderTarget = null;

    private minMaxData = new Float32Array(4);
    private binData = new Float32Array(NUM_BINS * 4);

    private additiveBlend: BlendState;

    constructor(device: GraphicsDevice) {
        this.device = device;

        this.additiveBlend = new BlendState(
            true,
            BLENDEQUATION_ADD, BLENDMODE_ONE, BLENDMODE_ONE,
            BLENDEQUATION_ADD, BLENDMODE_ONE, BLENDMODE_ONE
        );
    }

    private ensureSharedResources() {
        const { device } = this;

        if (!this.reduceShader) {
            this.reduceShader = ShaderUtils.createShader(device, {
                uniqueName: 'histFinalReduce',
                attributes: { vertex_position: SEMANTIC_POSITION },
                vertexGLSL: fullscreenVS,
                fragmentGLSL: finalReduceFS
            });
        }

        if (!this.tileTex) {
            this.tileTex = new Texture(device, {
                name: 'histTile',
                width: GRID_DIM,
                height: GRID_DIM,
                format: PIXELFORMAT_RGBA32F,
                mipmaps: false,
                addressU: ADDRESS_CLAMP_TO_EDGE,
                addressV: ADDRESS_CLAMP_TO_EDGE
            });
            this.tileRT = new RenderTarget({ colorBuffer: this.tileTex, depth: false });

            this.minMaxTex = new Texture(device, {
                name: 'histMinMax',
                width: 1,
                height: 1,
                format: PIXELFORMAT_RGBA32F,
                mipmaps: false,
                addressU: ADDRESS_CLAMP_TO_EDGE,
                addressV: ADDRESS_CLAMP_TO_EDGE
            });
            this.minMaxRT = new RenderTarget({ colorBuffer: this.minMaxTex, depth: false });

            this.binTex = new Texture(device, {
                name: 'histBins',
                width: NUM_BINS,
                height: 1,
                format: PIXELFORMAT_RGBA32F,
                mipmaps: false,
                addressU: ADDRESS_CLAMP_TO_EDGE,
                addressV: ADDRESS_CLAMP_TO_EDGE
            });
            this.binRT = new RenderTarget({ colorBuffer: this.binTex, depth: false });
        }
    }

    private getTileShader(shBands: number): Shader {
        let shader = this.tileShaders.get(shBands);
        if (!shader) {
            const defines = new Map<string, string>();
            defines.set('SH_BANDS', `${shBands}`);
            shader = ShaderUtils.createShader(this.device, {
                uniqueName: `histTileMinMax_SH${shBands}`,
                attributes: { vertex_position: SEMANTIC_POSITION },
                vertexGLSL: fullscreenVS,
                fragmentGLSL: tileMinMaxFS,
                fragmentDefines: defines
            });
            this.tileShaders.set(shBands, shader);
        }
        return shader;
    }

    private getBinShader(shBands: number): Shader {
        let shader = this.binShaders.get(shBands);
        if (!shader) {
            const defines = new Map<string, string>();
            defines.set('SH_BANDS', `${shBands}`);
            shader = ShaderUtils.createShader(this.device, {
                uniqueName: `histBin_SH${shBands}`,
                attributes: { vertex_position: SEMANTIC_POSITION },
                vertexGLSL: binVS,
                fragmentGLSL: binFS,
                vertexDefines: defines
            });
            this.binShaders.set(shBands, shader);
        }
        return shader;
    }

    private setSplatUniforms(splat: Splat, mode: number, options?: CalcHistogramOptions) {
        const { scope } = this.device;
        const numSplats = splat.splatData.numSplats;
        const resource = splat.entity.gsplat.instance.resource as any;
        const transformA = resource.getTexture('transformA');
        const transformB = resource.getTexture('transformB');
        const splatColor = resource.getTexture('splatColor');
        const splatTransform = splat.transformTexture;
        const transformPalette = splat.transformPalette.texture;
        const splatState = splat.stateTexture;

        const shBands = getShBands(splat);
        const numCoeffs = SH_NUM_COEFFS[shBands] ?? 0;

        const entityMatrix = options?.entityMatrix ?? identity;
        const viewMatrix = options?.viewMatrix ?? identity;
        const viewProjection = options?.viewProjection ?? identity;
        const cameraPos = options?.cameraPos ?? zeroVec3;
        const onScreenOnly = options?.onScreenOnly ? 1 : 0;

        // ColorGrade math, kept in sync with ColorGrade in src/color-grade.ts.
        const { tintClr, temperature, saturation, brightness, blackPoint, whitePoint, transparency } = splat;
        const cgInvRange = 1 / (whitePoint - blackPoint);

        const values: any = {
            transformA,
            transformB,
            splatColor,
            splatTransform,
            transformPalette,
            splatState,
            splat_params: [transformA.width, numSplats],
            propMode: mode,
            entityMatrix: entityMatrix.data,
            viewMatrix: viewMatrix.data,
            viewProjection: viewProjection.data,
            cameraWorldPos: [cameraPos.x, cameraPos.y, cameraPos.z],
            onScreenOnly,
            cgScale: [
                cgInvRange * tintClr.r * (1 + temperature),
                cgInvRange * tintClr.g,
                cgInvRange * tintClr.b * (1 - temperature)
            ],
            cgOffset: -blackPoint + brightness,
            cgSaturation: saturation,
            transparency
        };

        if (shBands > 0) {
            values.splatSH_1to3 = resource.getTexture('splatSH_1to3');
            values.shNumCoeffs = numCoeffs;
        }
        if (shBands > 1) {
            values.splatSH_4to7 = resource.getTexture('splatSH_4to7');
            values.splatSH_8to11 = resource.getTexture('splatSH_8to11');
        }
        if (shBands > 2) {
            values.splatSH_12to15 = resource.getTexture('splatSH_12to15');
        }

        resolve(scope, values);

        return numSplats;
    }

    private clearRT(rt: RenderTarget) {
        const d = this.device as any;
        const oldRt = d.renderTarget;
        const oldVx = d.vx, oldVy = d.vy, oldVw = d.vw, oldVh = d.vh;
        const oldSx = d.sx, oldSy = d.sy, oldSw = d.sw, oldSh = d.sh;

        d.setRenderTarget(rt);
        d.updateBegin();
        d.setViewport(0, 0, rt.width, rt.height);
        d.setScissor(0, 0, rt.width, rt.height);
        d.clear({ color: [0, 0, 0, 0], flags: 1 });
        d.updateEnd();

        d.setRenderTarget(oldRt);
        d.setViewport(oldVx, oldVy, oldVw, oldVh);
        d.setScissor(oldSx, oldSy, oldSw, oldSh);
    }

    // release all GPU resources owned by this instance. peer data-processor
    // classes (Intersect, SelectByRange, CalcBound) destroy resources only on
    // size change; CalcHistogram resources are fixed-size, so this exists for
    // explicit teardown (context loss, scene reload) rather than per-run reuse.
    destroy() {
        this.tileRT?.destroy();
        this.tileTex?.destroy();
        this.minMaxRT?.destroy();
        this.minMaxTex?.destroy();
        this.binRT?.destroy();
        this.binTex?.destroy();
        this.tileRT = null;
        this.tileTex = null;
        this.minMaxRT = null;
        this.minMaxTex = null;
        this.binRT = null;
        this.binTex = null;
        this.tileShaders.clear();
        this.binShaders.clear();
        this.reduceShader = null;
    }

    async run(splat: Splat, mode: number, options?: CalcHistogramOptions): Promise<CalcHistogramResult> {
        this.ensureSharedResources();
        const { device } = this;
        const { scope } = device;

        const shBands = getShBands(splat);
        const tileShader = this.getTileShader(shBands);
        const binShader = this.getBinShader(shBands);

        const numSplats = this.setSplatUniforms(splat, mode, options);

        const tileSize = Math.ceil(numSplats / (GRID_DIM * GRID_DIM));
        scope.resolve('tileSize').setValue(tileSize);
        scope.resolve('gridDim').setValue(GRID_DIM);

        // pass 1: tile min/max (fullscreen quad over GRID_DIM x GRID_DIM)
        device.setBlendState(BlendState.NOBLEND);
        drawQuadWithShader(device, this.tileRT, tileShader);

        // pass 2: final reduce 64x64 → 1x1
        scope.resolve('inputTex').setValue(this.tileTex);
        scope.resolve('gridDim').setValue(GRID_DIM);
        device.setBlendState(BlendState.NOBLEND);
        drawQuadWithShader(device, this.minMaxRT, this.reduceShader);

        // pass 3: clear bins, then additive-blend point dispatch
        this.clearRT(this.binRT);

        // bin shader needs same splat uniforms + minMax + numBins
        this.setSplatUniforms(splat, mode, options);
        scope.resolve('minMax').setValue(this.minMaxTex);
        scope.resolve('numBins').setValue(NUM_BINS);

        drawPointsWithShader(device, this.binRT, binShader, numSplats, this.additiveBlend);

        // readback minMax (8 bytes) and bins (4 KB)
        await this.minMaxTex.read(0, 0, 1, 1, {
            renderTarget: this.minMaxRT,
            data: this.minMaxData,
            immediate: false
        });

        await this.binTex.read(0, 0, NUM_BINS, 1, {
            renderTarget: this.binRT,
            data: this.binData,
            immediate: false
        });

        let min = this.minMaxData[0];
        let max = this.minMaxData[1];

        // detect "nothing contributed" (sentinel survives reduction)
        if (min > max) {
            min = 0;
            max = 0;
        }

        const selected = new Float32Array(NUM_BINS);
        const unselected = new Float32Array(NUM_BINS);
        let numValues = 0;
        for (let i = 0; i < NUM_BINS; i++) {
            const s = this.binData[i * 4];
            const u = this.binData[i * 4 + 1];
            selected[i] = s;
            unselected[i] = u;
            numValues += s + u;
        }

        return { selected, unselected, min, max, numValues };
    }
}

export { CalcHistogram };
export type { CalcHistogramOptions, CalcHistogramResult };
