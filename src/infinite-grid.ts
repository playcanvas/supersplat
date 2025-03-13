import {
    BLENDMODE_ONE,
    BLENDMODE_ONE_MINUS_SRC_ALPHA,
    BLENDMODE_SRC_ALPHA,
    BLENDEQUATION_ADD,
    CULLFACE_NONE,
    FUNC_LESSEQUAL,
    SEMANTIC_POSITION,
    createShaderFromCode,
    BlendState,
    DepthState,
    Layer,
    QuadRender,
    Shader,
    Vec3
} from 'playcanvas';

import { Element, ElementType } from './element';
import { Serializer } from './serializer';
import { vertexShader, fragmentShader } from './shaders/infinite-grid-shader';

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

        const blendState = new BlendState(
            true,
            BLENDEQUATION_ADD, BLENDMODE_SRC_ALPHA, BLENDMODE_ONE_MINUS_SRC_ALPHA,
            BLENDEQUATION_ADD, BLENDMODE_ONE, BLENDMODE_ONE_MINUS_SRC_ALPHA
        );

        this.scene.camera.entity.camera.on('preRenderLayer', (layer: Layer, transparent: boolean) => {
            if (this.visible && layer === this.scene.debugLayer && !transparent && this.scene.camera.renderOverlays) {
                device.setBlendState(blendState);
                device.setCullMode(CULLFACE_NONE);
                device.setDepthState(DepthState.WRITEDEPTH);
                device.setStencilState(null, null);

                // select the correctly plane in orthographic mode
                const { camera } = this.scene;
                if (camera.ortho) {
                    const cmp = (a:Vec3, b: Vec3) => 1.0 - Math.abs(a.dot(b)) < 1e-03;
                    const z = camera.entity.getWorldTransform().getZ();
                    const which = cmp(z, Vec3.RIGHT) ? 0 : (cmp(z, Vec3.BACK) ? 2 : 1);
                    device.scope.resolve('plane').setValue(which);
                } else {
                    // default is xz plane
                    device.scope.resolve('plane').setValue(1);
                }

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
