import {
    BLEND_NORMAL,
    BUFFER_STATIC,
    PRIMITIVE_POINTS,
    SEMANTIC_POSITION,
    ShaderMaterial,
    Mesh,
    MeshInstance,
    TYPE_UINT32,
    VertexBuffer,
    VertexFormat
} from 'playcanvas';

import { ElementType, Element } from './element';
import { vertexShader, fragmentShader } from './shaders/splat-overlay-shader';
import { Splat } from './splat';

class SplatOverlay extends Element {
    meshInstance: MeshInstance;

    constructor() {
        super(ElementType.debug);
    }

    add() {
        const scene = this.scene;
        const device = scene.graphicsDevice;

        const material = new ShaderMaterial({
            uniqueName: 'splatOverlayMaterial',
            attributes: { vertex_id: SEMANTIC_POSITION },
            vertexCode: vertexShader,
            fragmentCode: fragmentShader
        });
        material.blendType = BLEND_NORMAL;

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
                count: splatData.numSplats
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
            const selectedClr = events.invoke('selectedClr');
            const unselectedClr = events.invoke('unselectedClr');
            this.meshInstance.material.setParameter('splatSize', splatSize * window.devicePixelRatio);
            this.meshInstance.material.setParameter('selectedClr', [selectedClr.r, selectedClr.g, selectedClr.b, selectedClr.a]);
            this.meshInstance.material.setParameter('unselectedClr', [unselectedClr.r, unselectedClr.g, unselectedClr.b, unselectedClr.a]);
            this.scene.app.drawMeshInstance(this.meshInstance);
        }
    }
}

export { SplatOverlay };
