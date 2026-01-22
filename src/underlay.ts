import {
    BLENDEQUATION_ADD,
    BLENDMODE_ONE,
    BLENDMODE_ZERO,
    SEMANTIC_POSITION,
    BlendState,
    Layer,
    Shader,
    ShaderUtils,
    QuadRender,
    WebglGraphicsDevice
} from 'playcanvas';

import { Element, ElementType } from './element';
import { vertexShader, fragmentShader } from './shaders/blit-shader';

class Underlay extends Element {
    shader: Shader;
    quadRender: QuadRender;
    enabled = true;

    constructor() {
        super(ElementType.other);
    }

    add() {
        const device = this.scene.app.graphicsDevice;

        this.shader = ShaderUtils.createShader(device, {
            uniqueName: 'apply-underlay',
            attributes: {
                vertex_position: SEMANTIC_POSITION
            },
            vertexGLSL: vertexShader,
            fragmentGLSL: fragmentShader
        });

        this.quadRender = new QuadRender(this.shader);

        const blitTextureId = device.scope.resolve('blitTexture');
        const blendState = new BlendState(true,
            BLENDEQUATION_ADD, BLENDMODE_ONE, BLENDMODE_ONE,
            BLENDEQUATION_ADD, BLENDMODE_ZERO, BLENDMODE_ONE
        );

        const events = this.scene.events;

        this.scene.camera.camera.on('postRenderLayer', (layer: Layer, transparent: boolean) => {
            // underlay is used when outline mode is disabled
            if (!this.enabled || events.invoke('view.outlineSelection')) {
                return;
            }

            // apply after splat layer
            if (layer !== this.scene.splatLayer || !transparent) {
                return;
            }

            device.setBlendState(blendState);

            // read overlay data from workTarget (populated by MRT splat render)
            blitTextureId.setValue(this.scene.camera.workTarget.colorBuffer);

            const glDevice = device as WebglGraphicsDevice;
            glDevice.setRenderTarget(this.scene.camera.mainTarget);
            glDevice.updateBegin();
            this.quadRender.render();
            glDevice.updateEnd();
        });
    }

    remove() {
        // event listeners are cleaned up when camera is destroyed
    }

    onPreRender() {
        // no longer need to manage a separate camera
    }
}

export { Underlay };
