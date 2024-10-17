import {
    createShaderFromCode,
    BLEND_NORMAL,
    BUFFER_STATIC,
    PRIMITIVE_POINTS,
    SEMANTIC_POSITION,
    Material,
    Mesh,
    MeshInstance,
    TYPE_UINT32,
    VertexBuffer,
    VertexFormat,
} from 'playcanvas';
import { Splat } from './splat';
import { ElementType, Element } from './element';
import { vertexShader, fragmentShader } from './shaders/splat-overlay-shader';

class SplatOverlay extends Element {
    meshInstance: MeshInstance;

    constructor() {
        super(ElementType.debug);
    }

    add() {
        const scene = this.scene;
        const device = scene.graphicsDevice;

        const shader = createShaderFromCode(device, vertexShader, fragmentShader, `splatOverlayShader`, {
            vertex_id: SEMANTIC_POSITION
        });

        const material = new Material();
        material.name = 'splatOverlayMaterial';
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
                semantic: SEMANTIC_POSITION,
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
            material.setParameter('splatTransform', splat.transformTexture);
            material.setParameter('transformPalette', splat.transformPalette.texture);
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
            events.invoke('camera.overlay') &&
            events.invoke('camera.mode') === 'centers') {
            this.meshInstance.material.setParameter('splatSize', splatSize * window.devicePixelRatio);
            this.scene.app.drawMeshInstance(this.meshInstance);
        }
    }
}

export { SplatOverlay };
