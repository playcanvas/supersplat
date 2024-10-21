import {
    ADDRESS_CLAMP_TO_EDGE,
    CULLFACE_NONE,
    FILTER_NEAREST,
    PIXELFORMAT_RGBA8,
    SEMANTIC_POSITION,
    createShaderFromCode,
    BlendState,
    DepthState,
    Color,
    Entity,
    Shader,
    Texture,
    RenderTarget,
    QuadRender,
    WebglGraphicsDevice,
} from "playcanvas";
import { Element, ElementType } from "./element";
import { vertexShader, fragmentShader } from './shaders/outline-shader';

class Outline extends Element {
    entity: Entity;
    colorBuffer: Texture;
    renderTarget: RenderTarget;

    shader: Shader;
    quadRender: QuadRender;

    constructor() {
        super(ElementType.other);

        this.entity = new Entity('outlineCamera');
        this.entity.addComponent('camera', {
            priority: -1,
        });
        this.entity.camera.setShaderPass('OUTLINE');
        this.entity.camera.clearColor = new Color(0, 0, 0, 0);
    }

    add() {
        const device = this.scene.app.graphicsDevice;

        // render overlay layer only
        this.entity.camera.layers = [this.scene.overlayLayer.id];

        this.scene.camera.entity.addChild(this.entity);

        this.scene.events.on('camera.resize', (size: { width: number, height: number }) => this.rebuildRenderTargets(size.width, size.height));

        this.shader = createShaderFromCode(device, vertexShader, fragmentShader, 'apply-outline', {
            vertex_position: SEMANTIC_POSITION
        });

        this.quadRender = new QuadRender(this.shader);

        const outlineTextureId = device.scope.resolve('outlineTexture');

        // apply the outline texture to the display before gizmos render
        this.scene.gizmoLayer.onPostRenderOpaque = () => {
            device.setBlendState(BlendState.NOBLEND);
            device.setCullMode(CULLFACE_NONE);
            device.setDepthState(DepthState.NODEPTH);
            device.setStencilState(null, null);

            outlineTextureId.setValue(this.colorBuffer);

            const glDevice = device as WebglGraphicsDevice;
            glDevice.setRenderTarget(this.scene.camera.entity.camera);
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
    }

    rebuildRenderTargets(width: number, height: number) {
        const old = this.renderTarget;
        if (old) {
            old.destroyTextureBuffers();
            old.destroy();
        }

        const createTexture = (name: string, format: number) => {
            return new Texture(this.scene.app.graphicsDevice, {
                name, width, height, format,
                mipmaps: false,
                minFilter: FILTER_NEAREST,
                magFilter: FILTER_NEAREST,
                addressU: ADDRESS_CLAMP_TO_EDGE,
                addressV: ADDRESS_CLAMP_TO_EDGE
            });
        };

        const colorBuffer = createTexture('cameraOutline', PIXELFORMAT_RGBA8);
        const renderTarget = new RenderTarget({
            colorBuffer,
            depth: false,
        });

        this.colorBuffer = colorBuffer;
        this.renderTarget = renderTarget;

        this.entity.camera.renderTarget = renderTarget;
    }
}

export { Outline };
