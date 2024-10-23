import {
    createShaderFromCode,
    BLEND_NORMAL,
    BUFFER_STATIC,
    PRIMITIVE_POINTS,
    SEMANTIC_ATTR13,
    SEMANTIC_ATTR14,
    Material,
    Mesh,
    MeshInstance,
    TYPE_UINT32,
    VertexBuffer,
    VertexFormat,
} from 'playcanvas';
import { Splat } from './splat';
import { ElementType, Element } from './element';
import { GSplatLabels } from './gsplat-labels';

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
        const vs = /* glsl */ `
        attribute uint vertex_id;
        attribute uint class_id;

        uniform mat4 matrix_model;
        uniform mat4 matrix_viewProjection;

        uniform sampler2D splatState;
        uniform highp usampler2D splatPosition;
        uniform float splatSize;
        uniform uvec2 texParams;

        varying vec4 varying_color;

        // Visualize class instances
        uniform vec3 classColors[${GSplatLabels.MAX_UNIFORM_COLORS}];
        uniform bool useOriginalColor; // true = use original splat color, false = use class-based colors

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
                        if (useOriginalColor) {
                            // Use the original splat color from texture
                            varying_color = vec4(0.0, 0.0, 1.0, 0.5);
                        } else {
                            if (class_id == 0u){
                                varying_color = vec4(1.0, 0.0, 1.0, 0.5); // Unlabelled point - pink
                            }else{
                                varying_color = vec4(classColors[class_id], 0.5); // Use class color
                            }
                        }
                }

                vec3 p = uintBitsToFloat(texelFetch(splatPosition, splatUV, 0).xyz);

                gl_Position = matrix_viewProjection * matrix_model * vec4(p, 1.0);
                gl_PointSize = splatSize;
            }
        }
        `;

        const scene = this.scene;
        const device = scene.graphicsDevice;

        const shader = createShaderFromCode(device, vs, fs, `splatDebugShader`, {
            vertex_id: SEMANTIC_ATTR13,
            class_id: SEMANTIC_ATTR14,
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

            const vertexFormat = new VertexFormat(device, [
                {
                semantic: SEMANTIC_ATTR13,
                components: 1,
                type: TYPE_UINT32,
                asInt: true
                },
                {
                    semantic: SEMANTIC_ATTR14,
                    components: 1,
                    type: TYPE_UINT32,
                    asInt: true
                }
            ]);

            // TODO: make use of Splat's mapping instead of rendering all splats
            const vertexData = new Uint32Array(splatData.numSplats * 2);
            var class_ids;
            if (splat.labelData === null){
                class_ids = new Uint32Array(splatData.numSplats);
            }else{
                class_ids = splat.labelData.labels[0].category_annotations;
            }

            for (let i = 0; i < splatData.numSplats; ++i) {
                vertexData[i * 2] = i;
                vertexData[i * 2 + 1] =  class_ids[i];
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
            material.setParameter('classColors[0]', splat.labelData === null ? new Float32Array(splatData.numSplats * 3): splat.labelData.concatenated_colors()) //Todo Use color gradient for n classes
            material.setParameter('useOriginalColor', + splat.useOriginalColor);
            material.setParameter('texParams', [splat.stateTexture.width, splat.stateTexture.height]);
            material.update();

            meshInstance.node = splat.entity;
        };

        events.on('selection.changed', (selection: Splat) => {
            update(selection);
        });

        events.on('splat.debugShowClasses', (selection: Splat) => {
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
