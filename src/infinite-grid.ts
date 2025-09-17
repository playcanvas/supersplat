import {
    BLENDMODE_ONE,
    BLENDMODE_ONE_MINUS_SRC_ALPHA,
    BLENDMODE_SRC_ALPHA,
    BLENDEQUATION_ADD,
    CULLFACE_NONE,
    FUNC_LESSEQUAL,
    SEMANTIC_POSITION,
    BlendState,
    DepthState,
    Layer,
    QuadRender,
    ScopeSpace,
    Shader,
    ShaderUtils,
    Vec3,
    Mat4
} from 'playcanvas';

import { Element, ElementType } from './element';
import { Serializer } from './serializer';
import { vertexShader, fragmentShader } from './shaders/infinite-grid-shader';

const resolve = (scope: ScopeSpace, values: any) => {
    for (const key in values) {
        scope.resolve(key).setValue(values[key]);
    }
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

        this.shader = ShaderUtils.createShader(device, {
            uniqueName: 'infinite-grid',
            attributes: {
                vertex_position: SEMANTIC_POSITION
            },
            vertexGLSL: vertexShader,
            fragmentGLSL: fragmentShader
        });

        this.quadRender = new QuadRender(this.shader);

        const blendState = new BlendState(
            true,
            BLENDEQUATION_ADD, BLENDMODE_SRC_ALPHA, BLENDMODE_ONE_MINUS_SRC_ALPHA,
            BLENDEQUATION_ADD, BLENDMODE_ONE, BLENDMODE_ONE_MINUS_SRC_ALPHA
        );

        const view_position = [0, 0, 0];
        const viewProjectionMatrix = new Mat4();
        let plane;

        this.scene.camera.entity.camera.on('preRenderLayer', (layer: Layer, transparent: boolean) => {
            const { scene } = this;
            if (this.visible && layer === scene.debugLayer && !transparent && scene.camera.renderOverlays) {
                const { camera } = scene;

                device.setBlendState(blendState);
                device.setCullMode(CULLFACE_NONE);
                device.setDepthState(DepthState.WRITEDEPTH);
                device.setStencilState(null, null);

                // select the correctly plane in orthographic mode
                if (camera.ortho) {
                    const cmp = (a:Vec3, b: Vec3) => 1.0 - Math.abs(a.dot(b)) < 1e-03;
                    const z = camera.entity.getWorldTransform().getZ();
                    plane = cmp(z, Vec3.RIGHT) ? 0 : (cmp(z, Vec3.BACK) ? 2 : 1);
                } else {
                    // default is xz plane
                    plane = 1;
                }

                const p = camera.entity.getPosition();
                view_position[0] = p.x;
                view_position[1] = p.y;
                view_position[2] = p.z;

                viewProjectionMatrix.mul2(camera.entity.camera.projectionMatrix, camera.entity.camera.viewMatrix);

                resolve(device.scope, {
                    plane,
                    view_position,
                    matrix_viewProjection: viewProjectionMatrix.data
                });

                this.quadRender.render();
            }
        });
    }

    remove() {
        this.shader.destroy();
        this.quadRender.destroy();
    }

    serialize(serializer: Serializer): void {
        serializer.pack(this.visible);
    }
}

export { InfiniteGrid };
