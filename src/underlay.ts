import {
    ADDRESS_CLAMP_TO_EDGE,
    FILTER_NEAREST,
    PIXELFORMAT_RGBA8,
    SEMANTIC_POSITION,
    createShaderFromCode,
    BlendState,
    Color,
    Entity,
    Shader,
    Texture,
    RenderTarget,
    QuadRender,
    WebglGraphicsDevice,
    LAYERID_WORLD
} from "playcanvas";
import { Element, ElementType } from "./element";
import { vertexShader, fragmentShader } from './shaders/blit-shader';

class Underlay extends Element {
    entity: Entity;
    colorBuffer: Texture;
    renderTarget: RenderTarget;

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
        this.entity.camera.layers = [LAYERID_WORLD];
        this.scene.camera.entity.addChild(this.entity);

        const device = this.scene.app.graphicsDevice;

        this.scene.events.on('camera.resize', (size: { width: number, height: number }) => this.rebuildRenderTargets(size.width, size.height));

        this.shader = createShaderFromCode(device, vertexShader, fragmentShader, 'apply-blit', {
            vertex_position: SEMANTIC_POSITION
        });

        this.quadRender = new QuadRender(this.shader);

        this.scene.app.on('postrender', () => this.onPostRenders());
    }

    remove() {
        this.scene.camera.entity.removeChild(this.entity);
    }

    onPostRenders(): void {
        const device = this.scene.app.graphicsDevice;

        const blitTextureId = device.scope.resolve('blitTexture');

        const blendState = device.blendState.clone();
        device.setBlendState(BlendState.ADDBLEND);

        blitTextureId.setValue(this.colorBuffer);

        const glDevice = device as WebglGraphicsDevice;
        glDevice.setRenderTarget(this.scene.camera.entity.camera.renderTarget);
        glDevice.updateBegin();
        this.quadRender.render();
        glDevice.updateEnd();
        device.setBlendState(blendState)

        const renderTarget = this.scene.camera.entity.camera.renderTarget;

        // resolve msaa buffer
        if (renderTarget.samples > 1) {
            renderTarget.resolve(true, false);
        }

        // copy render target
        glDevice.copyRenderTarget(renderTarget, null, true, false);
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
        // NOTE: reuse depthBuffer from the main camera
        const renderTarget = new RenderTarget({
            colorBuffer,
            depthBuffer: this.scene.camera.entity.camera.renderTarget.depthBuffer
        });

        this.colorBuffer = colorBuffer;
        this.renderTarget = renderTarget;

        this.entity.camera.renderTarget = renderTarget;
    }
}

export { Underlay };
