import {
    BLENDMODE_ONE,
    BLENDMODE_ONE_MINUS_SRC_ALPHA,
    BLENDMODE_SRC_ALPHA,
    BLENDEQUATION_ADD,
    CULLFACE_NONE,
    FUNC_LESSEQUAL,
    PROJECTION_PERSPECTIVE,
    SEMANTIC_POSITION,
    createShaderFromCode,
    BlendState,
    DepthState,
    Mat4,
    QuadRender,
    Shader,
    Vec4,
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

        const cameraPositionId = device.scope.resolve('camera_position');
        const cameraViewProjectionId = device.scope.resolve('camera_viewProjection');

        const nearOriginId = device.scope.resolve('near_origin');
        const nearXId = device.scope.resolve('near_x');
        const nearYId = device.scope.resolve('near_y');

        const farOriginId = device.scope.resolve('far_origin');
        const farXId = device.scope.resolve('far_x');
        const farYId = device.scope.resolve('far_y');

        const blendState = new BlendState(
            true,
            BLENDEQUATION_ADD, BLENDMODE_SRC_ALPHA, BLENDMODE_ONE_MINUS_SRC_ALPHA,
            BLENDEQUATION_ADD, BLENDMODE_ONE, BLENDMODE_ONE_MINUS_SRC_ALPHA
        );

        const va = new Vec4();
        const vb = new Vec4();
        const vc = new Vec4();

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
                const cameraPosition = cameraMatrix.getTranslation();
                const cameraViewProjection = new Mat4().mul2(camera.projectionMatrix, camera.viewMatrix);

                cameraPositionId.setValue([cameraPosition.x, cameraPosition.y, cameraPosition.z]);
                cameraViewProjectionId.setValue(cameraViewProjection.data);

                const cameraViewProjectionInverse = cameraViewProjection.clone().invert();

                // near
                if (camera.projection === PROJECTION_PERSPECTIVE) {
                    // perspective
                    va.set(cameraPosition.x, cameraPosition.y, cameraPosition.z, 1);
                    vb.set(0, 0, 0, 0);
                    vc.set(0, 0, 0, 0);
                } else {
                    // orthographic
                    cameraViewProjectionInverse.transformVec4(new Vec4(0, 0, -1000, 1), va);
                    cameraViewProjectionInverse.transformVec4(new Vec4(1, 0, -1000, 1), vb);
                    cameraViewProjectionInverse.transformVec4(new Vec4(0, 1, -1000, 1), vc);
                    va.mulScalar(1 / va.w);
                    vb.mulScalar(1 / vb.w).sub(va);
                    vc.mulScalar(1 / vc.w).sub(va);
                }

                nearOriginId.setValue([va.x, va.y, va.z]);
                nearXId.setValue([vb.x, vb.y, vb.z]);
                nearYId.setValue([vc.x, vc.y, vc.z]);

                // far
                cameraViewProjectionInverse.transformVec4(new Vec4(0, 0, 1, 1), va);
                cameraViewProjectionInverse.transformVec4(new Vec4(1, 0, 1, 1), vb);
                cameraViewProjectionInverse.transformVec4(new Vec4(0, 1, 1, 1), vc);
                va.mulScalar(1 / va.w);
                vb.mulScalar(1 / vb.w).sub(va);
                vc.mulScalar(1 / vc.w).sub(va);

                farOriginId.setValue([va.x, va.y, va.z]);
                farXId.setValue([vb.x, vb.y, vb.z]);
                farYId.setValue([vc.x, vc.y, vc.z]);

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
