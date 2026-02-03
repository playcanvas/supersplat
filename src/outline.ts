import {
    BlendState,
    Layer
} from 'playcanvas';

import { Element, ElementType } from './element';
import { vertexShader, fragmentShader } from './shaders/outline-shader';
import { ShaderQuad, SimpleRenderPass } from './utils/simple-render-pass';

class Outline extends Element {
    shaderQuad: ShaderQuad;
    renderPass: SimpleRenderPass;
    enabled = true;

    constructor() {
        super(ElementType.other);
    }

    add() {
        const device = this.scene.app.graphicsDevice;

        this.shaderQuad = new ShaderQuad(device, vertexShader, fragmentShader, 'apply-outline');
        this.renderPass = new SimpleRenderPass(device, this.shaderQuad, {
            blendState: BlendState.ALPHABLEND
        });

        const clr = [1, 1, 1, 1];

        const { camera, events } = this.scene;

        camera.camera.on('postRenderLayer', (layer: Layer, transparent: boolean) => {
            // only apply when outline mode is enabled
            if (!this.enabled || !events.invoke('view.outlineSelection')) {
                return;
            }

            // apply at the end of the gizmo layer (after overlay renders)
            if (layer !== this.scene.gizmoLayer || !transparent) {
                return;
            }

            events.invoke('selectedClr').toArray(clr);

            this.renderPass.execute({
                srcTexture: camera.workTarget.colorBuffer,
                alphaCutoff: events.invoke('camera.mode') === 'rings' ? 0.0 : 0.8,
                clr
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

export { Outline };
