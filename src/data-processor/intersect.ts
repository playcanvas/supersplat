import {
    ADDRESS_CLAMP_TO_EDGE,
    PIXELFORMAT_RGBA8,
    SEMANTIC_POSITION,
    drawQuadWithShader,
    GraphicsDevice,
    Mat4,
    RenderTarget,
    ScopeSpace,
    Shader,
    ShaderUtils,
    Texture,
    BlendState
} from 'playcanvas';

import { BufferPool } from './buffer-pool';
import { packedMaskHeight, packedMaskWidth } from './histogram-config';
import { vertexShader, fragmentShader } from '../shaders/intersection-shader';
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

const resolve = (scope: ScopeSpace, values: any) => {
    for (const key in values) {
        scope.resolve(key).setValue(values[key]);
    }
};

class Intersect {
    private device: GraphicsDevice;
    private dummyTexture: Texture;
    private viewProjectionMat = new Mat4();
    private shader: Shader = null;
    private texture: Texture = null;
    private renderTarget: RenderTarget = null;

    constructor(device: GraphicsDevice) {
        this.device = device;
        this.dummyTexture = new Texture(device, {
            width: 1,
            height: 1,
            format: PIXELFORMAT_RGBA8
        });
    }

    private getResources(width: number, numSplats: number) {
        const { device } = this;

        if (!this.shader) {
            this.shader = ShaderUtils.createShader(device, {
                uniqueName: 'intersectByMaskShader',
                attributes: {
                    vertex_position: SEMANTIC_POSITION
                },
                vertexGLSL: vertexShader,
                fragmentGLSL: fragmentShader
            });
        }

        const resultWidth = packedMaskWidth(width);
        const resultHeight = packedMaskHeight(resultWidth, numSplats);

        if (!this.texture || this.texture.width !== resultWidth || this.texture.height !== resultHeight) {
            if (this.texture) {
                this.texture.destroy();
                this.renderTarget.destroy();
            }

            this.texture = new Texture(device, {
                name: 'intersectTexture',
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
            shader: this.shader,
            texture: this.texture,
            renderTarget: this.renderTarget
        };
    }

    async run(options: IntersectOptions, splat: Splat, bufferPool: BufferPool): Promise<Uint8Array> {
        const { device } = this;
        const { scope } = device;

        const numSplats = splat.splatData.numSplats;
        const transformA = (splat.entity.gsplat.instance.resource as any).getTexture('transformA');
        const splatTransform = splat.transformTexture;
        const transformPalette = splat.transformPalette.texture;

        // update view projection matrix
        const camera = splat.scene.camera.camera;
        this.viewProjectionMat.mul2(camera.projectionMatrix, camera.viewMatrix);

        // allocate resources
        const resources = this.getResources(transformA.width, numSplats);

        resolve(scope, {
            transformA,
            splatTransform,
            transformPalette,
            splat_params: [transformA.width, numSplats],
            matrix_model: splat.entity.getWorldTransform().data,
            matrix_viewProjection: this.viewProjectionMat.data,
            output_params: [resources.texture.width, resources.texture.height]
        });

        const maskOptions = options as MaskOptions;

        if (maskOptions.mask) {
            resolve(scope, {
                mode: 0,
                mask: maskOptions.mask,
                mask_params: [maskOptions.mask.width, maskOptions.mask.height]
            });
        } else {
            resolve(scope, {
                mask: this.dummyTexture,
                mask_params: [0, 0]
            });
        }

        const rectOptions = options as RectOptions;
        if (rectOptions.rect) {
            resolve(scope, {
                mode: 1,
                rect_params: [
                    rectOptions.rect.x1 * 2.0 - 1.0,
                    rectOptions.rect.y1 * 2.0 - 1.0,
                    rectOptions.rect.x2 * 2.0 - 1.0,
                    rectOptions.rect.y2 * 2.0 - 1.0
                ]
            });
        } else {
            resolve(scope, {
                rect_params: [0, 0, 0, 0]
            });
        }

        const sphereOptions = options as SphereOptions;
        const boxOptions = options as BoxOptions;
        if (sphereOptions.sphere) {
            shapeInvMat.copy(sphereOptions.sphere.transform).invert();
            resolve(scope, {
                mode: 2,
                shape_matrix_inv: shapeInvMat.data
            });
        } else if (boxOptions.box) {
            shapeInvMat.copy(boxOptions.box.transform).invert();
            resolve(scope, {
                mode: 3,
                shape_matrix_inv: shapeInvMat.data
            });
        } else {
            resolve(scope, {
                shape_matrix_inv: identityMat.data
            });
        }

        device.setBlendState(BlendState.NOBLEND);
        drawQuadWithShader(device, resources.renderTarget, resources.shader);

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

export { Intersect, IntersectOptions, MaskOptions, RectOptions, SphereOptions, BoxOptions };
