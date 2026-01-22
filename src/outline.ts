import {
    CULLFACE_NONE,
    SEMANTIC_POSITION,
    BlendState,
    DepthState,
    Layer,
    Shader,
    ShaderUtils,
    QuadRender,
    WebglGraphicsDevice
} from 'playcanvas';

import { Element, ElementType } from './element';
import { vertexShader, fragmentShader } from './shaders/outline-shader';

class Outline extends Element {
    shader: Shader;
    quadRender: QuadRender;
    enabled = true;

    constructor() {
        super(ElementType.other);
    }

    add() {
        const device = this.scene.app.graphicsDevice;

        this.shader = ShaderUtils.createShader(device, {
            uniqueName: 'apply-outline',
            attributes: {
                vertex_position: SEMANTIC_POSITION
            },
            vertexGLSL: vertexShader,
            fragmentGLSL: fragmentShader
        });

        this.quadRender = new QuadRender(this.shader);

        const outlineTextureId = device.scope.resolve('outlineTexture');
        const alphaCutoffId = device.scope.resolve('alphaCutoff');
        const clrId = device.scope.resolve('clr');
        const clrStorage = [1, 1, 1, 1];
        const events = this.scene.events;

        // apply the outline effect after splat layer renders
        // the overlay data is now in workTarget.colorBuffer (populated by MRT splat render)
        this.scene.camera.camera.on('postRenderLayer', (layer: Layer, transparent: boolean) => {
            // only apply when outline mode is enabled
            if (!this.enabled || !events.invoke('view.outlineSelection')) {
                return;
            }

            // apply after splat layer
            if (layer !== this.scene.splatLayer || !transparent) {
                return;
            }

            device.setBlendState(BlendState.ALPHABLEND);
            device.setCullMode(CULLFACE_NONE);
            device.setDepthState(DepthState.NODEPTH);
            device.setStencilState(null, null);

            const selectedClr = events.invoke('selectedClr');
            clrStorage[0] = selectedClr.r;
            clrStorage[1] = selectedClr.g;
            clrStorage[2] = selectedClr.b;
            clrStorage[3] = selectedClr.a;

            // read overlay data from workTarget (populated by MRT splat render)
            outlineTextureId.setValue(this.scene.camera.workTarget.colorBuffer);
            alphaCutoffId.setValue(events.invoke('camera.mode') === 'rings' ? 0.0 : 0.4);
            clrId.setValue(clrStorage);

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

export { Outline };
