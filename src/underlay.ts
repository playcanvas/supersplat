import {
    BLENDEQUATION_ADD,
    BLENDMODE_ONE,
    BLENDMODE_ZERO,
    BlendState,
    Layer
} from 'playcanvas';

import { Element, ElementType } from './element';
import { vertexShader, fragmentShader } from './shaders/blit-shader';
import { ShaderQuad, SimpleRenderPass } from './utils/simple-render-pass';

class Underlay extends Element {
    shaderQuad: ShaderQuad;
    renderPass: SimpleRenderPass;
    enabled = true;

    constructor() {
        super(ElementType.other);
    }

    add() {
        const device = this.scene.app.graphicsDevice;

        this.shaderQuad = new ShaderQuad(device, vertexShader, fragmentShader, 'apply-underlay');
        this.renderPass = new SimpleRenderPass(device, this.shaderQuad, {
            blendState: new BlendState(true,
                BLENDEQUATION_ADD, BLENDMODE_ONE, BLENDMODE_ONE,
                BLENDEQUATION_ADD, BLENDMODE_ZERO, BLENDMODE_ONE
            )
        });

        const { camera, events } = this.scene;

        camera.camera.on('preRenderLayer', (layer: Layer, transparent: boolean) => {
            // underlay is used when outline mode is disabled
            if (!this.enabled || events.invoke('view.outlineSelection')) {
                return;
            }

            // apply at the start of the gizmo layer
            if (layer !== this.scene.gizmoLayer || transparent) {
                return;
            }

            this.renderPass.execute({
                srcTexture: camera.workTarget.colorBuffer
            });
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
