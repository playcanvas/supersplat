import {
    CULLFACE_NONE,
    SEMANTIC_POSITION,
    createShaderFromCode,
    BlendState,
    DepthState,
    Color,
    Entity,
    Layer,
    Shader,
    QuadRender,
    WebglGraphicsDevice
} from 'playcanvas';

import { Element, ElementType } from './element';
import { vertexShader, fragmentShader } from './shaders/outline-shader';

class Outline extends Element {
    entity: Entity;
    shader: Shader;
    quadRender: QuadRender;
    enabled = true;
    clr = new Color(1, 1, 1, 0.5);

    constructor() {
        super(ElementType.other);

        this.entity = new Entity('outlineCamera');
        this.entity.addComponent('camera');
        this.entity.camera.setShaderPass('OUTLINE');
        this.entity.camera.clearColor = new Color(0, 0, 0, 0);
    }

    add() {
        const device = this.scene.app.graphicsDevice;

        // render overlay layer only
        this.entity.camera.layers = [this.scene.overlayLayer.id];
        this.scene.camera.entity.addChild(this.entity);

        this.shader = createShaderFromCode(device, vertexShader, fragmentShader, 'apply-outline', {
            vertex_position: SEMANTIC_POSITION
        });

        this.quadRender = new QuadRender(this.shader);

        const outlineTextureId = device.scope.resolve('outlineTexture');
        const clrId = device.scope.resolve('clr');
        const clr = this.clr;
        const clrStorage = [1, 1, 1, 1];

        // apply the outline texture to the display before gizmos render
        this.entity.camera.onPostRenderLayer = (layer: Layer, transparent: boolean) => {
            if (!this.entity.enabled || layer !== this.scene.overlayLayer || !transparent) {
                return;
            }

            device.setBlendState(BlendState.ALPHABLEND);
            device.setCullMode(CULLFACE_NONE);
            device.setDepthState(DepthState.NODEPTH);
            device.setStencilState(null, null);

            clrStorage[0] = clr.r;
            clrStorage[1] = clr.g;
            clrStorage[2] = clr.b;
            clrStorage[3] = clr.a;

            outlineTextureId.setValue(this.entity.camera.renderTarget.colorBuffer);
            clrId.setValue(clrStorage);

            const glDevice = device as WebglGraphicsDevice;
            glDevice.setRenderTarget(this.scene.camera.entity.camera.renderTarget);
            glDevice.updateBegin();
            this.quadRender.render();
            glDevice.updateEnd();
        };
    }

    remove() {
        this.scene.camera.entity.removeChild(this.entity);
    }

    onPreRender() {
        // copy camera properties
        const src = this.scene.camera.entity.camera;
        const dst = this.entity.camera;

        dst.projection = src.projection;
        dst.horizontalFov = src.horizontalFov;
        dst.fov = src.fov;
        dst.nearClip = src.nearClip;
        dst.farClip = src.farClip;
        dst.orthoHeight = src.orthoHeight;

        this.entity.enabled = this.enabled && this.scene.events.invoke('view.outlineSelection');
        this.entity.camera.renderTarget = this.scene.camera.workRenderTarget;
    }
}

export { Outline };
