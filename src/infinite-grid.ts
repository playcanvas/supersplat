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
