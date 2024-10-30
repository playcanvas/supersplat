import {
    BLENDEQUATION_ADD,
    BLENDMODE_ONE,
    BLENDMODE_ZERO,
    SEMANTIC_POSITION,
    createShaderFromCode,
    BlendState,
    Color,
    Entity,
    Layer,
    Shader,
    QuadRender,
    WebglGraphicsDevice,
} from "playcanvas";
import { Element, ElementType } from "./element";
import { vertexShader, fragmentShader } from './shaders/blit-shader';

class Underlay extends Element {
    entity: Entity;
    shader: Shader;
    quadRender: QuadRender;
    enabled = true;

    constructor() {
        super(ElementType.other);

        this.entity = new Entity('underlayCamera');
        this.entity.addComponent('camera');
        this.entity.camera.setShaderPass('UNDERLAY');
        this.entity.camera.clearColor = new Color(0, 0, 0, 0);
    }

    add() {
        const device = this.scene.app.graphicsDevice;

        this.entity.camera.layers = [this.scene.overlayLayer.id];
        this.scene.camera.entity.addChild(this.entity);

        this.shader = createShaderFromCode(device, vertexShader, fragmentShader, 'apply-underlay', {
            vertex_position: SEMANTIC_POSITION
        });

        this.quadRender = new QuadRender(this.shader);

        const blitTextureId = device.scope.resolve('blitTexture');
        const blendState = new BlendState(true,
            BLENDEQUATION_ADD, BLENDMODE_ONE, BLENDMODE_ONE,
            BLENDEQUATION_ADD, BLENDMODE_ZERO, BLENDMODE_ONE
        );

        this.entity.camera.onPostRenderLayer = (layer: Layer, transparent: boolean) => {
            if (!this.entity.enabled || layer !== this.scene.overlayLayer || !transparent) {
                return;
            }

            device.setBlendState(blendState);

            blitTextureId.setValue(this.entity.camera.renderTarget.colorBuffer);

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

        this.entity.enabled = this.enabled && !this.scene.events.invoke('view.outlineSelection');
        this.entity.camera.renderTarget = this.scene.camera.workRenderTarget;
    }
}

export { Underlay };
