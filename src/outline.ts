import {
    CULLFACE_NONE,
    SEMANTIC_POSITION,
    BlendState,
    DepthState,
    Color,
    Entity,
    Layer,
    Shader,
    ShaderUtils,
    QuadRender,
    WebglGraphicsDevice
} from 'playcanvas';

import { Element, ElementType } from './element';
import { vertexShader, fragmentShader } from './shaders/outline-shader';
import { Splat } from './splat';

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
        const layerId = this.scene.overlayLayer.id;

        // add selected splat to outline layer
        this.scene.events.on('selection.changed', (splat: Splat, prev: Splat) => {
            if (prev) {
                prev.entity.gsplat.layers = prev.entity.gsplat.layers.filter(id => id !== layerId);
            }
            if (splat) {
                splat.entity.gsplat.layers = splat.entity.gsplat.layers.concat([layerId]);
            }
        });

        // render overlay layer only
        this.entity.camera.layers = [layerId];
        this.scene.camera.entity.addChild(this.entity);

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

        // apply the outline texture to the display before gizmos render
        this.entity.camera.on('postRenderLayer', (layer: Layer, transparent: boolean) => {
            if (!this.entity.enabled || layer !== this.scene.overlayLayer || !transparent) {
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

            outlineTextureId.setValue(this.entity.camera.renderTarget.colorBuffer);
            alphaCutoffId.setValue(events.invoke('camera.mode') === 'rings' ? 0.0 : 0.4);
            clrId.setValue(clrStorage);

            const glDevice = device as WebglGraphicsDevice;
            glDevice.setRenderTarget(this.scene.camera.entity.camera.renderTarget);
            glDevice.updateBegin();
            this.quadRender.render();
            glDevice.updateEnd();
        });
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
