import {
    CULLFACE_NONE,
    SEMANTIC_POSITION,
    BlendState,
    DepthState,
    GraphicsDevice,
    QuadRender,
    RenderPass,
    Shader,
    ShaderUtils,
    StencilParameters,
    Vec4
} from 'playcanvas';

import { resolve } from './resolve';

class ShaderQuad {
    shader: Shader;
    quadRender: QuadRender;

    constructor(device: GraphicsDevice, vertexGLSL: string, fragmentGLSL: string, uniqueName: string) {
        this.shader = ShaderUtils.createShader(device, {
            uniqueName,
            attributes: {
                vertex_position: SEMANTIC_POSITION
            },
            vertexGLSL,
            fragmentGLSL
        });

        this.quadRender = new QuadRender(this.shader);
    }

    render(viewport?: Vec4, scissor?: Vec4) {
        this.quadRender.render(viewport, scissor);
    }

    destroy() {
        this.shader.destroy();
        this.quadRender.destroy();
    }
}

interface Renderable {
    render(viewport?: Vec4, scissor?: Vec4): void;
}

class SimpleRenderPass extends RenderPass {
    blendState = BlendState.NOBLEND;
    cullMode = CULLFACE_NONE;
    depthState = DepthState.NODEPTH;
    stencilFront: StencilParameters = null;
    stencilBack: StencilParameters = null;
    viewport: Vec4 = null;
    scissor: Vec4 = null;

    renderable: Renderable;
    vars: () => object = null;

    constructor(device: GraphicsDevice, renderable: Renderable, args?: Partial<SimpleRenderPass>) {
        super(device);
        this.renderable = renderable;
        Object.assign(this, args);
    }

    execute(vars: any = {}) {
        const { device, blendState, cullMode, depthState, stencilFront, stencilBack, viewport, scissor } = this;

        if (this.vars) {
            resolve(device.scope, this.vars());
        }

        resolve(device.scope, vars);

        device.setBlendState(blendState);
        device.setCullMode(cullMode);
        device.setDepthState(depthState);
        device.setStencilState(stencilFront, stencilBack);

        this.renderable.render(viewport, scissor);
    }
}

export { ShaderQuad, SimpleRenderPass };
