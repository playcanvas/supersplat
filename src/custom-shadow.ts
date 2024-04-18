import {
    ADDRESS_CLAMP_TO_EDGE,
    BLEND_PREMULTIPLIED,
    PROJECTION_ORTHOGRAPHIC,
    SEMANTIC_POSITION,
    SEMANTIC_TEXCOORD0,
    createShaderFromCode,
    drawQuadWithShader,
    shaderChunks,
    Color,
    Entity,
    GraphicsDevice,
    Material,
    MeshInstance,
    RenderComponent,
    RenderTarget,
    Shader,
    StandardMaterial,
    Texture
} from 'playcanvas';
import {Element, ElementType} from './element';
import {Model} from './model';

// shadow map dimension
const dim = 512;

const shadowPS = (dim: string) => {
    return /*glsl_*/ `
uniform sampler2D source;
varying vec2 vUv0;

float dim = ${dim};
float step = 1.0 / ${dim};

const int numSamples = 32;

float random(vec2 co)
{
    float a = 12.9898;
    float b = 78.233;
    float c = 43758.5453;
    float dt = dot(co.xy ,vec2(a,b));
    float sn = mod(dt,3.14);
    return fract(sin(sn) * c);
}

void main(void)
{
    vec2 uv = vUv0;

    float filterSize = step * 10.0;

    float sum = 0.0;
    for (int i = 0; i < numSamples; ++i) {

        float radius = random(vec2(uv.x * dim, i)) * filterSize;
        float angle = random(vec2(i, uv.y * dim)) * 2.0 * 3.14159;
        vec2 offset = vec2(cos(angle), sin(angle)) * radius;

        vec4 t = texture2D(source, uv + offset);

        sum += 1.0 - t.y;
    }

    gl_FragColor = vec4(0, 0, 0, sum / float(numSamples));
}
`;
};

const shadowDef = {
    vertex: (shaderChunks as any).fullscreenQuadVS,
    fragment: shadowPS(`${dim}.0`)
};

// blur shader
const blurPS = (stepX: string, stepY: string) => {
    return /*glsl_*/ `
uniform sampler2D source;
varying vec2 vUv0;

vec2 step = vec2(${stepX}, ${stepY});

void main(void)
{
    vec2 uv = vUv0;

    gl_FragColor = (
        texture2D(source, uv - step * 3.5) +
        texture2D(source, uv - step * 2.5) +
        texture2D(source, uv - step * 1.5) +
        texture2D(source, uv - step * 0.5) +
        texture2D(source, uv + step * 0.5) +
        texture2D(source, uv + step * 1.5) +
        texture2D(source, uv + step * 2.5) +
        texture2D(source, uv + step * 3.5)
    ) / 8.0;
}
`;
};

const hblurDef = {
    vertex: (shaderChunks as any).fullscreenQuadVS,
    fragment: blurPS(`1.0 / ${dim}.0`, `0.0`)
};

const vblurDef = {
    vertex: (shaderChunks as any).fullscreenQuadVS,
    fragment: blurPS(`0.0`, `1.0 / ${dim}.0`)
};

// catcher shader
const catcherVS = /*glsl_*/ `
attribute vec3 vertex_position;
attribute vec2 vertex_texCoord;

uniform mat4 matrix_model;
uniform mat4 matrix_viewProjection;

varying vec2 texCoord;
varying vec3 worldPos;

void main(void)
{
    // vertex in the world space
    gl_Position = matrix_viewProjection * matrix_model * vec4(vertex_position, 1.0);
    texCoord = vertex_texCoord;
    worldPos = (matrix_model * vec4(vertex_position, 1.0)).xyz;
}
`;

const catcherPS = /*glsl_*/ `
uniform sampler2D source;
uniform float shadowIntensity;

varying vec2 texCoord;
varying vec3 worldPos;

uniform vec3 view_position;
uniform vec3 sceneMin;
uniform vec3 sceneMax;

void main(void)
{
    float shadow = texture2D(source, texCoord).a;

    shadow = pow(shadow, 1.25);

    float v = max(0.0, min(1.0, normalize(view_position - worldPos).y * 6.0)) * 2.0;
    float fade = (v < 1.0) ? (v * v * 0.5) : ((v - 1.0) * (v - 3.0) - 1.0) * -0.5;
    gl_FragColor = vec4(0, 0, 0, mix(0.0, shadowIntensity, shadow) * fade);
}
`;

const catcherDef = {
    vertex: catcherVS,
    fragment: catcherPS,
    attributes: {
        vertex_position: SEMANTIC_POSITION,
        vertex_texCoord: SEMANTIC_TEXCOORD0
    }
};

// helper function to create shader
const createShader = (
    graphicsDevice: GraphicsDevice,
    name: string,
    shaderInfo: {vertex: string; fragment: string; attributes?: any}
) => {
    return createShaderFromCode(graphicsDevice, shaderInfo.vertex, shaderInfo.fragment, name, shaderInfo.attributes);
};

class CustomShadow extends Element {
    material: Material;
    plane: Entity;

    shadowShader: Shader;
    hblurShader: Shader;
    vblurShader: Shader;

    camera: Entity;
    textures: Texture[] = [];
    renderTargets: RenderTarget[] = [];

    constructor() {
        super(ElementType.shadow);

        this.material = new Material();
        this.material.depthWrite = false;
        this.material.blendType = BLEND_PREMULTIPLIED;

        this.plane = new Entity('ShadowPlane');
        this.plane.addComponent('render', {
            type: 'plane',
            castShadows: false,
            material: this.material
        });

        // create camera
        this.camera = new Entity('ShadowCamera');
        this.camera.addComponent('camera', {
            clearColor: new Color(255, 255, 255, 0),
            frustumCulling: false,
            projection: PROJECTION_ORTHOGRAPHIC,
            aspectRatio: 1
        });
        this.camera.enabled = false;
        this.camera.camera.setShaderPass('shadow_catcher_depth');
    }

    destroy() {
        super.destroy();
        this.plane.destroy();
    }

    add() {
        // create the camera render target
        for (let i = 0; i < 2; ++i) {
            this.textures[i] = new Texture(this.scene.graphicsDevice, {
                name: `custom-shadow-${i}`,
                width: dim,
                height: dim,
                mipmaps: false,
                addressU: ADDRESS_CLAMP_TO_EDGE,
                addressV: ADDRESS_CLAMP_TO_EDGE
            });
        }

        this.renderTargets = this.textures.map(texture => new RenderTarget({colorBuffer: texture, depth: true}));

        this.camera.camera.renderTarget = this.renderTargets[0];

        this.material.shader = createShader(this.scene.graphicsDevice, 'ShadowCatcher', catcherDef);
        this.material.setParameter('source', this.textures[1]);
        this.material.update();

        this.shadowShader = createShader(this.scene.graphicsDevice, 'Shadow', shadowDef);

        this.hblurShader = createShader(this.scene.graphicsDevice, 'HBlur', hblurDef);
        this.vblurShader = createShader(this.scene.graphicsDevice, 'VBlur', vblurDef);

        this.scene.app.root.addChild(this.plane);
        this.scene.app.root.addChild(this.camera);

        this.scene.events.on('scene.boundUpdated', this.regenerate, this);
        this.scene.graphicsDevice.on('devicerestored', this.regenerate, this);
    }

    remove() {
        this.scene.graphicsDevice.off('devicerestored', this.regenerate, this);
        this.scene.events.off('scene.boundUpdated', this.regenerate, this);

        this.scene.app.root.removeChild(this.camera);
        this.scene.app.root.removeChild(this.plane);

        this.camera.camera.renderTarget = null;

        this.shadowShader.destroy();
        this.shadowShader = null;

        this.hblurShader.destroy();
        this.vblurShader.destroy();
        this.hblurShader = this.vblurShader = null;

        this.material.shader.destroy();
        this.material.shader = null;
        this.material.update();

        this.renderTargets.forEach(rt => rt.destroy());
        this.renderTargets = [];

        this.textures.forEach(tex => tex.destroy());
        this.textures = [];
    }

    regenerate() {
        const bound = this.scene.bound;
        const center = bound.center;
        const extents = bound.halfExtents;
        const len = Math.max(extents.x, extents.z);

        // place camera
        this.camera.setPosition(center.x, bound.getMin().y, center.z);
        this.camera.setLocalEulerAngles(90, 0, 0);
        this.camera.camera.nearClip = 0;
        this.camera.camera.farClip = extents.y * 2;
        this.camera.camera.orthoHeight = len * 2;

        // place the plane under the scene
        this.plane.setPosition(center.x, bound.getMin().y, center.z);
        this.plane.setLocalScale(len * 4, 1, len * 4);

        const graphicsDevice = this.scene.graphicsDevice;

        graphicsDevice.scope.resolve('sceneMin').setValue([center.x - len, bound.getMin().y, center.z - len]);
        graphicsDevice.scope.resolve('sceneMax').setValue([center.x + len, bound.getMax().y, center.z + len]);

        // render the top-down view
        this.camera.enabled = true;
        this.plane.enabled = false;
        this.scene.camera.entity.enabled = false;

        this.scene.app.root.syncHierarchy();
        this.scene.app.renderComposition(this.scene.app.scene.layers);

        const source = graphicsDevice.scope.resolve('source');

        // resolve shadow
        source.setValue(this.textures[0]);
        drawQuadWithShader(graphicsDevice, this.renderTargets[1], this.shadowShader);

        for (let i = 0; i < 2; ++i) {
            // hblur
            source.setValue(this.textures[1]);
            drawQuadWithShader(graphicsDevice, this.renderTargets[0], this.hblurShader);

            // vblur
            source.setValue(this.textures[0]);
            drawQuadWithShader(graphicsDevice, this.renderTargets[1], this.vblurShader);
        }

        // restore cameras
        this.camera.enabled = false;
        this.plane.enabled = true;
        this.scene.camera.entity.enabled = true;
    }

    onPreRender() {
        this.material.setParameter('shadowIntensity', this.scene.config.shadow.intensity);
    }

    onAdded(element: Element): void {
        if (element.type === ElementType.model || element.type === ElementType.splat) {
            const seen = new Set();

            const modelElement = element as Model;

            modelElement.entity.findComponents('render').forEach((render: RenderComponent) => {
                render.meshInstances.forEach((meshInstance: MeshInstance) => {
                    const material = meshInstance.material as StandardMaterial;

                    if (!seen.has(material)) {
                        seen.add(material);

                        material.chunks = {
                            basePS:
                                (shaderChunks as any).basePS +
                                /*glsl*/ `
                                uniform vec3 sceneMin;
                                uniform vec3 sceneMax;
                                `,
                            debugOutputPS: /*glsl*/ `
                                #ifdef SHADOW_CATCHER_DEPTH_PASS
                                gl_FragColor.rgb = (vPositionW - sceneMin) / (sceneMax - sceneMin);
                                #endif
                                `
                        };
                        material.update();
                    }
                });
            });
        }
    }
}

export {CustomShadow};
