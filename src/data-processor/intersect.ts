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

import { vertexShader, fragmentShader } from '../shaders/intersection-shader';
import { Splat } from '../splat';

type MaskOptions = {
    mask: Texture;
};

type RectOptions = {
    rect: { x1: number, y1: number, x2: number, y2: number };
};

type SphereOptions = {
    sphere: { x: number, y: number, z: number, radius: number };
};

type BoxOptions = {
    box: { x: number, y: number, z: number, lenx: number, leny: number, lenz: number };
};

type IntersectOptions = MaskOptions | RectOptions | SphereOptions | BoxOptions;

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
    private data: Uint8Array = null;

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

        const resultWidth = Math.max(1, Math.floor(width / 2));
        const resultHeight = Math.ceil(numSplats / (resultWidth * 4));

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

            this.data = new Uint8Array(resultWidth * resultHeight * 4);
        }

        return {
            shader: this.shader,
            texture: this.texture,
            renderTarget: this.renderTarget,
            data: this.data
        };
    }

    async run(options: IntersectOptions, splat: Splat): Promise<Uint8Array> {
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
        if (sphereOptions.sphere) {
            resolve(scope, {
                mode: 2,
                sphere_params: [
                    sphereOptions.sphere.x,
                    sphereOptions.sphere.y,
                    sphereOptions.sphere.z,
                    sphereOptions.sphere.radius
                ]
            });
        } else {
            resolve(scope, {
                sphere_params: [0, 0, 0, 0]
            });
        }

        const boxOptions = options as BoxOptions;
        if (boxOptions.box) {
            resolve(scope, {
                mode: 3,
                box_params: [
                    boxOptions.box.x,
                    boxOptions.box.y,
                    boxOptions.box.z,
                    0
                ],
                aabb_params: [
                    boxOptions.box.lenx * 0.5,
                    boxOptions.box.leny * 0.5,
                    boxOptions.box.lenz * 0.5,
                    0
                ]
            });
        } else {
            resolve(scope, {
                box_params: [0, 0, 0, 0],
                aabb_params: [0, 0, 0, 0]
            });
        }

        device.setBlendState(BlendState.NOBLEND);
        drawQuadWithShader(device, resources.renderTarget, resources.shader);

        const data = await resources.texture.read(0, 0, resources.texture.width, resources.texture.height, {
            renderTarget: resources.renderTarget,
            data: resources.data,
            immediate: false
        });

        return data as Uint8Array;
    }
}

export { Intersect, IntersectOptions, MaskOptions, RectOptions, SphereOptions, BoxOptions };
