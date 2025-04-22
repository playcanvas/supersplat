import {
    ADDRESS_CLAMP_TO_EDGE,
    PIXELFORMAT_RGBA8,
    PIXELFORMAT_RGBA32F,
    SEMANTIC_POSITION,
    createShaderFromCode,
    drawQuadWithShader,
    BoundingBox,
    GraphicsDevice,
    Mat4,
    RenderTarget,
    ScopeSpace,
    Shader,
    Texture,
    Vec3,
    WebglGraphicsDevice,
    BlendState
} from 'playcanvas';

import { vertexShader as boundVS, fragmentShader as boundFS } from './shaders/bound-shader';
import { vertexShader as intersectionVS, fragmentShader as intersectionFS } from './shaders/intersection-shader';
import { vertexShader as positionVS, fragmentShader as positionFS } from './shaders/position-shader';
import { Splat } from './splat';

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

const v1 = new Vec3();
const v2 = new Vec3();

const resolve = (scope: ScopeSpace, values: any) => {
    for (const key in values) {
        scope.resolve(key).setValue(values[key]);
    }
};

type IntersectResources = {
    shader: Shader;
    texture: Texture;
    renderTarget: RenderTarget;
    data: Uint8Array;
};

type BoundResources = {
    shader: Shader;
    minTexture: Texture;
    maxTexture: Texture;
    renderTarget: RenderTarget;
    minRenderTarget: RenderTarget;
    maxRenderTarget: RenderTarget;
    minData: Float32Array;
    maxData: Float32Array;
};

type PositionResources = {
    shader: Shader;
    texture: Texture;
    renderTarget: RenderTarget;
    data: Float32Array;
};

// gpu processor for splat data
class DataProcessor {
    device: GraphicsDevice;
    dummyTexture: Texture;
    viewProjectionMat = new Mat4();
    splatParams = new Int32Array(3);

    getIntersectResources: (width: number, numSplats: number) => IntersectResources;
    getBoundResources: (splatTextureWidth: number) => BoundResources;
    getPositionResources: (width: number, height: number, numSplats: number) => PositionResources;

    constructor(device: GraphicsDevice) {
        this.device = device;
        this.dummyTexture = new Texture(device, {
            width: 1,
            height: 1,
            format: PIXELFORMAT_RGBA8
        });

        const createTexture = (name: string, width: number, height: number, format: number) => {
            return new Texture(device, {
                name,
                width,
                height,
                format,
                mipmaps: false,
                addressU: ADDRESS_CLAMP_TO_EDGE,
                addressV: ADDRESS_CLAMP_TO_EDGE
            });
        };

        // intersection test

        this.getIntersectResources = (() => {
            let shader: Shader = null;
            let texture: Texture = null;
            let renderTarget: RenderTarget = null;
            let data: Uint8Array = null;

            return (width: number, numSplats: number) => {
                if (!shader) {
                    shader = createShaderFromCode(device, intersectionVS, intersectionFS, 'intersectByMaskShader', {
                        vertex_position: SEMANTIC_POSITION
                    });
                }

                const resultWidth = Math.max(1, Math.floor(width / 2));
                const resultHeight = Math.ceil(numSplats / (resultWidth * 4));

                if (!texture || texture.width !== resultWidth || texture.height !== resultHeight) {
                    if (texture) {
                        texture.destroy();
                        renderTarget.destroy();
                    }

                    texture = createTexture('intersectTexture', resultWidth, resultHeight, PIXELFORMAT_RGBA8);
                    renderTarget = new RenderTarget({
                        colorBuffer: texture,
                        depth: false
                    });

                    data = new Uint8Array(resultWidth * resultHeight * 4);
                }

                return { shader, texture, renderTarget, data };
            };
        })();

        // calc bound

        this.getBoundResources = (() => {
            let shader: Shader = null;
            let minTexture: Texture = null;
            let maxTexture: Texture = null;
            let renderTarget: RenderTarget = null;
            let minRenderTarget: RenderTarget = null;
            let maxRenderTarget: RenderTarget = null;
            let minData: Float32Array = null;
            let maxData: Float32Array = null;

            return (width: number) => {
                if (!shader) {
                    shader = createShaderFromCode(device, boundVS, boundFS, 'calcBoundShader', {
                        vertex_position: SEMANTIC_POSITION
                    });
                }

                if (!minTexture || minTexture.width !== width) {
                    if (minTexture) {
                        minTexture.destroy();
                        maxTexture.destroy();
                        renderTarget.destroy();
                        minRenderTarget.destroy();
                        maxRenderTarget.destroy();
                    }

                    minTexture = createTexture('calcBoundMin', width, 1, PIXELFORMAT_RGBA32F);
                    maxTexture = createTexture('calcBoundMax', width, 1, PIXELFORMAT_RGBA32F);

                    renderTarget = new RenderTarget({
                        colorBuffers: [minTexture, maxTexture],
                        depth: false
                    });

                    maxRenderTarget = new RenderTarget({
                        colorBuffer: maxTexture,
                        depth: false
                    });

                    minRenderTarget = new RenderTarget({
                        colorBuffer: minTexture,
                        depth: false
                    });

                    minData = new Float32Array(width * 4);
                    maxData = new Float32Array(width * 4);
                }

                return { shader, minTexture, maxTexture, renderTarget, minRenderTarget, maxRenderTarget, minData, maxData };
            };
        })();

        // calc position

        this.getPositionResources = (() => {
            let shader: Shader = null;
            let texture: Texture = null;
            let renderTarget: RenderTarget = null;
            let data: Float32Array = null;

            return (width: number, height: number, numSplats: number) => {
                if (!shader) {
                    shader = createShaderFromCode(device, positionVS, positionFS, 'calcPositionShader', {
                        vertex_position: SEMANTIC_POSITION
                    });
                }

                if (!texture || texture.width !== width || texture.height !== height) {
                    if (texture) {
                        texture.destroy();
                        renderTarget.destroy();
                    }

                    texture = createTexture('positionTex', width, height, PIXELFORMAT_RGBA32F);
                    renderTarget = new RenderTarget({
                        colorBuffer: texture,
                        depth: false
                    });
                    data = new Float32Array(width * height * 4);
                }

                return { shader, texture, renderTarget, data };
            };
        })();
    }

    // calculate the intersection of a mask canvas with splat centers
    intersect(options: MaskOptions | RectOptions | SphereOptions | BoxOptions, splat: Splat) {
        const { device } = this;
        const { scope } = device;

        const numSplats = splat.splatData.numSplats;
        const transformA = splat.entity.gsplat.instance.splat.transformATexture;
        const splatTransform = splat.transformTexture;
        const transformPalette = splat.transformPalette.texture;

        // update view projection matrix
        const camera = splat.scene.camera.entity.camera;
        this.viewProjectionMat.mul2(camera.projectionMatrix, camera.viewMatrix);

        // allocate resources
        const resources = this.getIntersectResources(transformA.width, numSplats);

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

        const glDevice = device as WebglGraphicsDevice;
        glDevice.readPixels(0, 0, resources.texture.width, resources.texture.height, resources.data);

        return resources.data;
    }

    // use gpu to calculate either bound of the currently selected splats or the bound of
    // all visible splats
    calcBound(splat: Splat, boundingBox: BoundingBox, onlySelected: boolean) {
        const device = splat.scene.graphicsDevice;
        const { scope } = device;

        const numSplats = splat.splatData.numSplats;
        const transformA = splat.entity.gsplat.instance.splat.transformATexture;
        const splatTransform = splat.transformTexture;
        const transformPalette = splat.transformPalette.texture;
        const splatState = splat.stateTexture;

        this.splatParams[0] = transformA.width;
        this.splatParams[1] = transformA.height;
        this.splatParams[2] = numSplats;

        // get resources
        const resources = this.getBoundResources(transformA.width);

        resolve(scope, {
            transformA,
            splatTransform,
            transformPalette,
            splatState,
            splat_params: this.splatParams,
            mode: onlySelected ? 0 : 1
        });

        const glDevice = device as WebglGraphicsDevice;

        device.setBlendState(BlendState.NOBLEND);
        drawQuadWithShader(device, resources.renderTarget, resources.shader);
        glDevice.gl.readPixels(0, 0, transformA.width, 1, resources.minTexture.impl._glFormat, resources.minTexture.impl._glPixelType, resources.minData);

        glDevice.setRenderTarget(resources.maxRenderTarget);
        glDevice.updateBegin();
        glDevice.gl.readPixels(0, 0, transformA.width, 1, resources.maxTexture.impl._glFormat, resources.maxTexture.impl._glPixelType, resources.maxData);
        glDevice.updateEnd();

        // resolve mins/maxs
        const { minData, maxData } = resources;
        v1.set(minData[0], minData[1], minData[2]);
        v2.set(maxData[0], maxData[1], maxData[2]);

        for (let i = 1; i < transformA.width; i++) {
            v1.x = Math.min(v1.x, minData[i * 4]);
            v1.y = Math.min(v1.y, minData[i * 4 + 1]);
            v1.z = Math.min(v1.z, minData[i * 4 + 2]);

            v2.x = Math.max(v2.x, maxData[i * 4]);
            v2.y = Math.max(v2.y, maxData[i * 4 + 1]);
            v2.z = Math.max(v2.z, maxData[i * 4 + 2]);
        }

        boundingBox.setMinMax(v1, v2);
    }

    // calculate world-space splat positions
    calcPositions(splat: Splat) {
        const { device } = this;
        const { scope } = device;

        const numSplats = splat.splatData.numSplats;
        const transformA = splat.entity.gsplat.instance.splat.transformATexture;
        const splatTransform = splat.transformTexture;
        const transformPalette = splat.transformPalette.texture;

        // allocate resources
        const resources = this.getPositionResources(transformA.width, transformA.height, numSplats);

        resolve(scope, {
            transformA,
            splatTransform,
            transformPalette,
            splat_params: [transformA.width, numSplats]
        });

        device.setBlendState(BlendState.NOBLEND);
        drawQuadWithShader(device, resources.renderTarget, resources.shader);

        const glDevice = device as WebglGraphicsDevice;
        glDevice.gl.readPixels(
            0, 0,
            resources.texture.width,
            resources.texture.height,
            resources.texture.impl._glFormat,
            resources.texture.impl._glPixelType,
            resources.data
        );

        return resources.data;
    }
}

export { DataProcessor };
