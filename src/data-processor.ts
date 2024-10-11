import {
    createShaderFromCode,
    drawQuadWithShader,
    BlendState,
    GraphicsDevice,
    Mat4,
    RenderTarget,
    Shader,
    Texture,
    PIXELFORMAT_RGBA8,
    SEMANTIC_POSITION
} from 'playcanvas';
import { vertexShader, fragmentShader } from './shaders/intersection-shader';
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

// gpu processor for splat data
class DataProcessor {
    device: GraphicsDevice;
    dummyTexture: Texture;
    intersectShader: Shader;
    viewProjectionMat = new Mat4();

    constructor(device: GraphicsDevice) {
        this.device = device;
        this.dummyTexture = new Texture(device, {
            width: 1,
            height: 1,
            format: PIXELFORMAT_RGBA8
        });

        this.intersectShader = createShaderFromCode(device, vertexShader, fragmentShader, 'intersectByMask', {
            vertex_position: SEMANTIC_POSITION
        });
    }

    // calculate the intersection of a mask canvas with splat centers
    intersect(options: MaskOptions | RectOptions | SphereOptions, splat: Splat, result: RenderTarget) {
        const { device, intersectShader } = this;
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
        drawQuadWithShader(device, result, intersectShader);
    }
}

export { DataProcessor };
