import {
    ADDRESS_CLAMP_TO_EDGE,
    BLEND_NONE,
    BLENDEQUATION_ADD,
    BLENDMODE_ONE,
    BLENDMODE_ONE_MINUS_SRC_COLOR,
    BLENDMODE_ZERO,
    CLEARFLAG_COLOR,
    FILTER_NEAREST,
    PIXELFORMAT_RGBA16F,
    drawQuadWithShader,
    shaderChunks,
    Layer,
    MeshInstance,
    RenderComponent,
    RenderTarget,
    Shader,
    StandardMaterial,
    Texture,
    WebglGraphicsDevice,
    BlendState,
    SEMANTIC_POSITION
} from 'playcanvas';
import {Element, ElementType} from './element';
import {Model} from './model';

const accumPS =
    // @ts-ignore
    shaderChunks.outputAlphaPS +
    `
    float weight = clamp(pow(min(1.0, gl_FragColor.a * 10.0) + 0.01, 3.0) * 1e8 * 
                        pow(1.0 - gl_FragCoord.z * 0.9, 3.0), 1e-2, 3e3);
    gl_FragColor = vec4(gl_FragColor.rgb * gl_FragColor.a, gl_FragColor.a) * weight;
`;

const revealagePS =
    // @ts-ignore
    shaderChunks.outputAlphaPS +
    `
    gl_FragColor = vec4(gl_FragColor.a, 0, 0, 0);
`;

const vertexShaderHeader = (device: WebglGraphicsDevice) => {
    // @ts-ignore
    return device.webgl2 ? `#version 300 es\n\n${shaderChunks.gles3VS}\n` : '';
};

const fragmentShaderHeader = (device: WebglGraphicsDevice) => {
    return (
        // @ts-ignore
        (device.webgl2 ? `#version 300 es\n\n${shaderChunks.gles3PS}\n` : '') +
        `precision ${device.precision} float;\n\n`
    );
};

const resolveVshader = `
attribute vec2 vertex_position;
varying vec2 texcoord;
void main(void) {
    gl_Position = vec4(vertex_position, 0.5, 1.0);
    texcoord = vertex_position.xy * 0.5 + 0.5;
}
`;

const resolveFshader = `
varying vec2 texcoord;
uniform sampler2D uSceneColorMap;
uniform sampler2D uAccumMap;
uniform sampler2D uRevealageMap;
uniform float power;
void main(void) {
    vec4 scene = texture2D(uSceneColorMap, texcoord);
    vec4 accum = texture2D(uAccumMap, texcoord);
    float revealage = texture2D(uRevealageMap, texcoord).r;
    gl_FragColor = vec4(mix(accum.rgb / max(accum.a, 1e-5), scene.rgb, revealage), 1.0);
    // gl_FragColor = accum;
}
`;

const noBlend = new BlendState(false);
const accumBlend = new BlendState(true, BLENDEQUATION_ADD, BLENDMODE_ONE, BLENDMODE_ONE);
const revealageBlend = new BlendState(true, BLENDEQUATION_ADD, BLENDMODE_ZERO, BLENDMODE_ONE_MINUS_SRC_COLOR);

class Oit extends Element {
    accumRenderTarget: RenderTarget;

    revealageRenderTarget: RenderTarget;

    revealageLayer = new Layer({
        name: 'Revealage Layer'
    });

    resolveShader: Shader;

    constructor() {
        super(ElementType.other);
    }

    add() {
        const device = this.scene.graphicsDevice as WebglGraphicsDevice;

        // create the resolve shader
        this.resolveShader = new Shader(device, {
            attributes: {
                vertex_position: SEMANTIC_POSITION
            },
            vshader: vertexShaderHeader(device) + resolveVshader,
            fshader: fragmentShaderHeader(device) + resolveFshader
        });

        const layers = this.scene.app.scene.layers;
        const worldLayer = layers.getLayerByName('World');
        if (!worldLayer) {
            return;
        }

        worldLayer.onPreRenderTransparent = (/* pass: number */) => {
            // clear the camera's render target before rendering semitrans
            // (grabpass has already been captured).
            device.clear({
                color: [0, 0, 0, 0],
                flags: CLEARFLAG_COLOR
            });
        };

        this.revealageLayer.onPreRenderTransparent = (/* pass: number */) => {
            // copy the transparent buffer
            device.copyRenderTarget(device.renderTarget, this.accumRenderTarget, true, false);

            // clear target in preparation to render revealage
            device.clear({
                color: [1, 0, 0, 1],
                flags: CLEARFLAG_COLOR
            });
        };

        this.revealageLayer.onPostRenderTransparent = (/* pass: number */) => {
            // copy the revealage buffer
            device.copyRenderTarget(device.renderTarget, this.revealageRenderTarget, true, false);

            // resolve the built buffers
            device.setBlendState(noBlend);

            // resolve to the camera's render target
            drawQuadWithShader(device, this.scene.camera.entity.camera?.renderTarget, this.resolveShader);
        };

        // add revealage layer after world semitransparent
        layers.insertTransparent(this.revealageLayer, layers.getTransparentIndex(worldLayer) + 1);

        // add revealage layer to camera
        const camera = this.scene.camera;
        if (camera.entity.camera) {
            camera.entity.camera.layers = camera.entity.camera?.layers.concat([this.revealageLayer.id]);
        }
    }

    remove() {
        // TODO
    }

    onAdded(element: Element) {
        if (element.type !== ElementType.model) {
            return;
        }

        const model = element as Model;
        const newMeshInstances = model.entity
            .findComponents('render')
            .map((component: RenderComponent) => {
                return component.meshInstances
                    .map(meshInstance => {
                        if (meshInstance?.material?.blendType === BLEND_NONE) {
                            return null;
                        }

                        const accumMaterial = meshInstance.material as StandardMaterial;
                        accumMaterial.blendState = accumBlend;
                        accumMaterial.chunks = {
                            outputAlphaPS: accumPS
                        };

                        // copy the material so we can customize the alpha blending
                        const revealageMaterial = new StandardMaterial();
                        revealageMaterial.copy(accumMaterial);
                        revealageMaterial.blendState = revealageBlend;
                        revealageMaterial.chunks = {
                            outputAlphaPS: revealagePS
                        };

                        // construct a new mesh instance
                        return new MeshInstance(meshInstance.mesh, revealageMaterial, meshInstance.node);
                    })
                    .filter(a => a);
            })
            .flat();

        this.revealageLayer.addMeshInstances(newMeshInstances);
    }

    onRemoved(/* element: Element */) {
        // TODO
    }

    rebuildRenderTargets() {
        const device = this.scene.graphicsDevice as WebglGraphicsDevice;
        const {width, height} = this.scene.targetSize;

        if (
            this.accumRenderTarget &&
            this.accumRenderTarget.width === width &&
            this.accumRenderTarget.height === height
        ) {
            return;
        }

        if (this.accumRenderTarget) {
            this.accumRenderTarget.colorBuffer.destroy();
            this.accumRenderTarget.destroy();
        }

        if (this.revealageRenderTarget) {
            this.revealageRenderTarget.colorBuffer.destroy();
            this.revealageRenderTarget.destroy();
        }

        const createTexture = (width: number, height: number, format: number) => {
            return new Texture(device, {
                width: width,
                height: height,
                format: format,
                mipmaps: false,
                minFilter: FILTER_NEAREST,
                magFilter: FILTER_NEAREST,
                addressU: ADDRESS_CLAMP_TO_EDGE,
                addressV: ADDRESS_CLAMP_TO_EDGE
            });
        };

        const camera = this.scene.camera;
        const format = camera.entity.camera?.renderTarget?.colorBuffer?.format ?? PIXELFORMAT_RGBA16F;

        this.accumRenderTarget = new RenderTarget({
            colorBuffer: createTexture(width, height, format),
            depth: false,
            flipY: false,
            autoResolve: false
        });

        this.revealageRenderTarget = new RenderTarget({
            colorBuffer: createTexture(width, height, format),
            depth: false,
            flipY: false,
            autoResolve: false
        });

        device.scope.resolve('uAccumMap').setValue(this.accumRenderTarget.colorBuffer);
        device.scope.resolve('uRevealageMap').setValue(this.revealageRenderTarget.colorBuffer);
    }

    onPreRender() {
        this.rebuildRenderTargets();
    }
}

export {Oit};
