import {
    CULLFACE_NONE,
    SEMANTIC_POSITION,
    BlendState,
    DepthState,
    Mat4,
    QuadRender,
    Shader,
    createShaderFromCode,
    FUNC_LESSEQUAL,
    BLENDMODE_ONE,
    BLENDMODE_ONE_MINUS_SRC_ALPHA,
    BLENDMODE_SRC_ALPHA,
    BLENDEQUATION_ADD
} from 'playcanvas';
import { Element, ElementType } from './element';
import { Serializer } from './serializer';
import { vertexShader, fragmentShader } from './shaders/infinite-grid-shader';

const calcHalfSize = (fov: number, aspect: number, fovIsHorizontal: boolean) => {
    let x, y;
    if (fovIsHorizontal) {
        x = Math.tan(fov * Math.PI / 360);
        y = x / aspect;
    } else {
        y = Math.tan(fov * Math.PI / 360);
        x = y * aspect;
    }
    return [ x, y ];
};

class InfiniteGrid extends Element {
    shader: Shader;
    quadRender: QuadRender;
    blendState = new BlendState(false);
    depthState = new DepthState(FUNC_LESSEQUAL, true);

    visible = true;

    constructor() {
        super(ElementType.debug);
    }

    add() {
        const device = this.scene.app.graphicsDevice;

        this.shader = createShaderFromCode(device, vertexShader, fragmentShader, 'infinite-grid', {
            vertex_position: SEMANTIC_POSITION
        });

        this.quadRender = new QuadRender(this.shader);

        const cameraMatrixId = device.scope.resolve('camera_matrix');
        const cameraParamsId = device.scope.resolve('camera_params');
        const cameraPositionId = device.scope.resolve('camera_position');
        const cameraViewProjectionId = device.scope.resolve('camera_viewProjection');

        const blendState = new BlendState(
            true,
            BLENDEQUATION_ADD, BLENDMODE_SRC_ALPHA, BLENDMODE_ONE_MINUS_SRC_ALPHA,
            BLENDEQUATION_ADD, BLENDMODE_ONE, BLENDMODE_ONE_MINUS_SRC_ALPHA
        );

        this.scene.debugLayer.onPreRenderOpaque = () => {
            if (this.visible) {
                device.setBlendState(blendState);
                device.setCullMode(CULLFACE_NONE);
                device.setDepthState(DepthState.WRITEDEPTH);
                device.setStencilState(null, null);

                const cameraEntity = this.scene.camera.entity;
                const camera = cameraEntity.camera;

                // update viewProjectionInverse matrix
                const cameraMatrix = cameraEntity.getWorldTransform().clone();
                const cameraParams = calcHalfSize(camera.fov, camera.aspectRatio, camera.horizontalFov);
                const cameraPosition = cameraMatrix.getTranslation();
                const cameraViewProjection = new Mat4().mul2(camera.projectionMatrix, camera.viewMatrix);

                cameraMatrixId.setValue(cameraMatrix.data);
                cameraParamsId.setValue(cameraParams);
                cameraPositionId.setValue([cameraPosition.x, cameraPosition.y, cameraPosition.z]);
                cameraViewProjectionId.setValue(cameraViewProjection.data);
 
                this.quadRender.render();
            }
        };
    }

    remove() {
        this.scene.debugLayer.onPreRenderOpaque = null;
        this.shader.destroy();
        this.quadRender.destroy();
    }

    serialize(serializer: Serializer): void {
        serializer.pack(this.visible);
    }
}

export { InfiniteGrid };
