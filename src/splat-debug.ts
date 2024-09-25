import {
    createShaderFromCode,
    BLEND_NORMAL,
    BUFFER_STATIC,
    PRIMITIVE_POINTS,
    SEMANTIC_ATTR13,
    Material,
    Mesh,
    MeshInstance,
    TYPE_UINT32,
    VertexBuffer,
    VertexFormat,
} from 'playcanvas';
import { Splat } from './splat';
import { ElementType, Element } from './element';

const vs = /* glsl */ `
attribute uint vertex_id;

uniform mat4 matrix_model;
uniform mat4 matrix_viewProjection;

uniform sampler2D splatState;
uniform highp usampler2D splatPosition;
uniform float splatSize;
uniform uvec2 texParams;

varying vec4 varying_color;

// calculate the current splat index and uv
ivec2 calcSplatUV(uint index, uint width) {
    return ivec2(int(index % width), int(index / width));
}

void main(void) {
    ivec2 splatUV = calcSplatUV(vertex_id, texParams.x);
    uint splatState = uint(texelFetch(splatState, splatUV, 0).r * 255.0);

    if ((splatState & 6u) != 0u) {
        // deleted or hidden (4 or 2)
        gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
        gl_PointSize = 0.0;
    } else {
        if ((splatState & 1u) != 0u) {
            // selected
            varying_color = vec4(1.0, 1.0, 0.0, 0.5);
        } else {
            varying_color = vec4(0.0, 0.0, 1.0, 0.5);
        }

        vec3 p = uintBitsToFloat(texelFetch(splatPosition, splatUV, 0).xyz);

        gl_Position = matrix_viewProjection * matrix_model * vec4(p, 1.0);
        gl_PointSize = splatSize;
    }
}
`;

const fs = /* glsl */ `
varying vec4 varying_color;

void main(void) {
    gl_FragColor = varying_color;
}
`;

class SplatDebug extends Element {
    meshInstance: MeshInstance;

    constructor() {
        super(ElementType.debug);
    }

    add() {
        const scene = this.scene;
        const device = scene.graphicsDevice;

        const shader = createShaderFromCode(device, vs, fs, `splatDebugShader`, {
            vertex_id: SEMANTIC_ATTR13
        });

        const material = new Material();
        material.name = 'splatDebugMaterial';
        material.blendType = BLEND_NORMAL;
        material.shader = shader;

        const mesh = new Mesh(device);

        const meshInstance = new MeshInstance(mesh, material, null);

        const events = this.scene.events;

        const update = (splat: Splat) => {
            if (!splat) {
                meshInstance.node = null;
                return;
            }

            const splatData = splat.splatData;

            const vertexFormat = new VertexFormat(device, [{
                semantic: SEMANTIC_ATTR13,
                components: 1,
                type: TYPE_UINT32,
                asInt: true
            }]);

            // TODO: make use of Splat's mapping instead of rendering all splats
            const vertexData = new Uint32Array(splatData.numSplats);
            for (let i = 0; i < splatData.numSplats; ++i) {
                vertexData[i] = i;
            }

            const vertexBuffer = new VertexBuffer(device, vertexFormat, splatData.numSplats, {
                usage: BUFFER_STATIC,
                data: vertexData
            });

            if (mesh.vertexBuffer) {
                mesh.vertexBuffer.destroy();
                mesh.vertexBuffer = null;
            }

            mesh.vertexBuffer = vertexBuffer;
            mesh.primitive[0] = {
                type: PRIMITIVE_POINTS,
                base: 0,
                count: splatData.numSplats,
            };

            material.setParameter('splatState', splat.stateTexture);
            material.setParameter('splatPosition', splat.entity.gsplat.instance.splat.transformATexture);
            material.setParameter('texParams', [splat.stateTexture.width, splat.stateTexture.height]);
            material.update();

            meshInstance.node = splat.entity;
        };

        events.on('selection.changed', (selection: Splat) => {
            update(selection);
        });

        this.meshInstance = meshInstance;
    }

    destroy() {
        this.meshInstance.material.destroy();
        this.meshInstance.destroy();
    }

    onPreRender() {
        const events = this.scene.events;
        const splatSize = events.invoke('camera.splatSize');

        if (this.meshInstance.node &&
            splatSize > 0 &&
            events.invoke('camera.debug') &&
            events.invoke('camera.mode') === 'centers') {
            this.meshInstance.material.setParameter('splatSize', splatSize * window.devicePixelRatio);
            this.scene.app.drawMeshInstance(this.meshInstance);
        }
    }
}

export { SplatDebug };
