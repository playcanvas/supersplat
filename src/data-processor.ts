import {
    createShaderFromCode,
    drawQuadWithShader,
    BlendState,
    BoundingBox,
    GraphicsDevice,
    Mat4,
    RenderTarget,
    Shader,
    Texture,
    Vec3,
    WebglGraphicsDevice,
    PIXELFORMAT_RGBA8,
    PIXELFORMAT_RGBA32F,
    SEMANTIC_POSITION
} from 'playcanvas';
import { Splat } from './splat';

import { vertexShader as intersectionVS, fragmentShader as intersectionFS } from './shaders/intersection-shader';
import { vertexShader as boundVS, fragmentShader as boundFS } from './shaders/bound-shader';

type MaskOptions = {
    mask: Texture;
};

type RectOptions = {
    rect: { x1: number, y1: number, x2: number, y2: number };
};

type SphereOptions = {
    sphere: { x: number, y: number, z: number, radius: number };
};

const v1 = new Vec3();
const v2 = new Vec3();

// gpu processor for splat data
class DataProcessor {
    device: GraphicsDevice;
    dummyTexture: Texture;
    intersectShader: Shader;
    viewProjectionMat = new Mat4();

    boundShader: Shader;
    boundMinTexture: Texture;
    boundMaxTexture: Texture;
    boundRenderTarget: RenderTarget;
    boundMaxRenderTarget: RenderTarget;
    minData = new Float32Array(4);
    maxData = new Float32Array(4);
    minMaxData = new Float32Array(8);

    constructor(device: GraphicsDevice) {
        this.device = device;
        this.dummyTexture = new Texture(device, {
            width: 1,
            height: 1,
            format: PIXELFORMAT_RGBA8
        });

        this.intersectShader = createShaderFromCode(device, intersectionVS, intersectionFS, 'intersectByMaskShader', {
            vertex_position: SEMANTIC_POSITION
        });

        this.boundShader = createShaderFromCode(device, boundVS, boundFS, 'calcBoundShader', {
            vertex_position: SEMANTIC_POSITION
        });
    }

    // calculate the intersection of a mask canvas with splat centers
    intersect(options: MaskOptions | RectOptions | SphereOptions, splat: Splat, result: RenderTarget) {
        const { device } = this;
        const { scope } = device;

        const numSplats = splat.splatData.numSplats;
        const transformA = splat.entity.gsplat.instance.splat.transformATexture;
        const splatTransform = splat.transformTexture;
        const transformPalette = splat.transformPalette.texture;

        // update view projection matrix
        const camera = splat.scene.camera.entity.camera.camera;
        this.viewProjectionMat.mul2(camera.projectionMatrix, camera.viewMatrix);

        scope.resolve('transformA').setValue(transformA);
        scope.resolve('splatTransform').setValue(splatTransform);
        scope.resolve('transformPalette').setValue(transformPalette);
        scope.resolve('splat_params').setValue([transformA.width, numSplats]);
        scope.resolve('matrix_model').setValue(splat.entity.getWorldTransform().data);
        scope.resolve('matrix_viewProjection').setValue(this.viewProjectionMat.data);
        scope.resolve('output_params').setValue([result.width, result.height]);

        const maskOptions = options as MaskOptions;

        if (maskOptions.mask) {
            scope.resolve('mode').setValue(0);
            scope.resolve('mask').setValue(maskOptions.mask);
            scope.resolve('mask_params').setValue([maskOptions.mask.width, maskOptions.mask.height]);
        } else {
            scope.resolve('mask').setValue(this.dummyTexture);
            scope.resolve('mask_params').setValue(null);
        }

        const rectOptions = options as RectOptions;
        if (rectOptions.rect) {
            scope.resolve('mode').setValue(1);
            scope.resolve('rect_params').setValue([
                rectOptions.rect.x1 * 2.0 - 1.0,
                rectOptions.rect.y1 * 2.0 - 1.0,
                rectOptions.rect.x2 * 2.0 - 1.0,
                rectOptions.rect.y2 * 2.0 - 1.0
            ]);
        } else {
            scope.resolve('rect_params').setValue(null);
        }

        const sphereOptions = options as SphereOptions;
        if (sphereOptions.sphere) {
            scope.resolve('mode').setValue(2);
            scope.resolve('sphere_params').setValue([sphereOptions.sphere.x, sphereOptions.sphere.y, sphereOptions.sphere.z, sphereOptions.sphere.radius]);
        } else {
            scope.resolve('sphere_params').setValue(null);
        }

        device.setBlendState(BlendState.NOBLEND);
        drawQuadWithShader(device, result, this.intersectShader);
    }

    calcBound(splat: Splat, boundingBox: BoundingBox, onlySelected: boolean) {
        const device = splat.scene.graphicsDevice;

        if (!this.boundMinTexture) {
            this.boundMinTexture = new Texture(device, {
                width: 1,
                height: 1,
                format: PIXELFORMAT_RGBA32F,
                mipmaps: false
            });

            this.boundMaxTexture = new Texture(device, {
                width: 1,
                height: 1,
                format: PIXELFORMAT_RGBA32F,
                mipmaps: false
            });

            this.boundRenderTarget = new RenderTarget({
                colorBuffers: [this.boundMinTexture, this.boundMaxTexture],
                depth: false
            });

            this.boundMaxRenderTarget = new RenderTarget({
                colorBuffer: this.boundMaxTexture,
                depth: false
            });

            device.initRenderTarget(this.boundMaxRenderTarget);
        }

        const numSplats = splat.splatData.numSplats;
        const transformA = splat.entity.gsplat.instance.splat.transformATexture;
        const splatTransform = splat.transformTexture;
        const transformPalette = splat.transformPalette.texture;

        const { scope } = device;
        scope.resolve('transformA').setValue(transformA);
        scope.resolve('splatTransform').setValue(splatTransform);
        scope.resolve('transformPalette').setValue(transformPalette);
        scope.resolve('splatState').setValue(splat.stateTexture);
        scope.resolve('splat_params').setValue([transformA.width, numSplats]);

        scope.resolve('mode').setValue(onlySelected ? 0 : 1);

        device.setBlendState(BlendState.NOBLEND);
        drawQuadWithShader(device, this.boundRenderTarget, this.boundShader);

        const glDevice = device as WebglGraphicsDevice;

        glDevice.updateBegin();
        glDevice.gl.readPixels(0, 0, 1, 1, this.boundMinTexture.impl._glFormat, this.boundMinTexture.impl._glPixelType, this.minData);
        glDevice.updateEnd();

        glDevice.setRenderTarget(this.boundMaxRenderTarget);
        glDevice.updateBegin();
        glDevice.gl.readPixels(0, 0, 1, 1, this.boundMaxTexture.impl._glFormat, this.boundMaxTexture.impl._glPixelType, this.maxData);
        glDevice.updateEnd();

        v1.set(this.minData[0], this.minData[1], this.minData[2]);
        v2.set(this.maxData[0], this.maxData[1], this.maxData[2]);
        boundingBox.setMinMax(v1, v2);
    }
}

export { DataProcessor };
