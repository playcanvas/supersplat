import {
    ADDRESS_CLAMP_TO_EDGE,
    PIXELFORMAT_RGBA8,
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

import { BufferPool } from './buffer-pool';
import { packedMaskHeight, packedMaskWidth } from './histogram-config';
import { vertexShader, fragmentShader } from '../shaders/select-by-range-shader';
import { Splat } from '../splat';

const identity = new Mat4();
const zeroVec3 = new Vec3();

// number of SH coefficients per RGB band, indexed by GSplatResource.shBands.
const SH_NUM_COEFFS: { [k: number]: number } = { 0: 0, 1: 3, 2: 8, 3: 15 };

type SelectByRangeOptions = {
    min: number;
    max: number;
    numBins: number;
    rangeStart: number;
    rangeEnd: number;
    entityMatrix?: Mat4;
    viewMatrix?: Mat4;
    viewProjection?: Mat4;
    cameraPos?: Vec3;
    onScreenOnly?: boolean;
};

const resolve = (scope: ScopeSpace, values: any) => {
    for (const key in values) {
        scope.resolve(key).setValue(values[key]);
    }
};

const getShBands = (splat: Splat): number => {
    return (splat.entity.gsplat.instance.resource as any).shBands ?? 0;
};

// GPU pass that produces a 1-byte-per-splat selection mask for a given
// histogram bucket range. mirrors the packing scheme used by Intersect so the
// CPU readback is `numSplats` bytes (with up to 3 bytes of padding at the
// end), addressable directly as `mask[splatIdx]`.
class SelectByRange {
    private device: GraphicsDevice;

    // shaders compiled per SH_BANDS, same pattern as CalcHistogram.
    private shaders: Map<number, Shader> = new Map();
    private texture: Texture = null;
    private renderTarget: RenderTarget = null;

    constructor(device: GraphicsDevice) {
        this.device = device;
    }

    private getShader(shBands: number): Shader {
        let shader = this.shaders.get(shBands);
        if (!shader) {
            const defines = new Map<string, string>();
            defines.set('SH_BANDS', `${shBands}`);
            shader = ShaderUtils.createShader(this.device, {
                uniqueName: `selectByRangeShader_SH${shBands}`,
                attributes: {
                    vertex_position: SEMANTIC_POSITION
                },
                vertexGLSL: vertexShader,
                fragmentGLSL: fragmentShader,
                fragmentDefines: defines
            });
            this.shaders.set(shBands, shader);
        }
        return shader;
    }

    private getResources(width: number, numSplats: number) {
        // pack 4 splats per RGBA8 texel; layout shared with Intersect via histogram-config.
        const resultWidth = packedMaskWidth(width);
        const resultHeight = packedMaskHeight(resultWidth, numSplats);

        if (!this.texture || this.texture.width !== resultWidth || this.texture.height !== resultHeight) {
            if (this.texture) {
                this.texture.destroy();
                this.renderTarget.destroy();
            }

            this.texture = new Texture(this.device, {
                name: 'selectByRangeTexture',
                width: resultWidth,
                height: resultHeight,
                format: PIXELFORMAT_RGBA8,
                mipmaps: false,
                addressU: ADDRESS_CLAMP_TO_EDGE,
                addressV: ADDRESS_CLAMP_TO_EDGE
            });

            this.renderTarget = new RenderTarget({
                colorBuffer: this.texture,
                depth: false
            });
        }

        return {
            texture: this.texture,
            renderTarget: this.renderTarget
        };
    }

    async run(splat: Splat, mode: number, options: SelectByRangeOptions, bufferPool: BufferPool): Promise<Uint8Array> {
        const { device } = this;
        const { scope } = device;

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

        const resources = this.getResources(transformA.width, numSplats);
        const shader = this.getShader(shBands);

        const entityMatrix = options.entityMatrix ?? identity;
        const viewMatrix = options.viewMatrix ?? identity;
        const viewProjection = options.viewProjection ?? identity;
        const cameraPos = options.cameraPos ?? zeroVec3;
        const onScreenOnly = options.onScreenOnly ? 1 : 0;

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
            transparency,
            output_params: [resources.texture.width, resources.texture.height],
            minMax: [options.min, options.max],
            numBins: options.numBins,
            rangeStart: options.rangeStart,
            rangeEnd: options.rangeEnd
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

        device.setBlendState(BlendState.NOBLEND);
        drawQuadWithShader(device, resources.renderTarget, shader);

        const byteLen = resources.texture.width * resources.texture.height * 4;
        const buffer = bufferPool.acquire(byteLen);

        const data = await resources.texture.read(0, 0, resources.texture.width, resources.texture.height, {
            renderTarget: resources.renderTarget,
            data: buffer,
            immediate: false
        });

        return data as Uint8Array;
    }
}

export { SelectByRange };
export type { SelectByRangeOptions };
