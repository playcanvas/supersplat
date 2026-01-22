import {
    BLEND_NORMAL,
    BUFFER_STATIC,
    PRIMITIVE_POINTS,
    SEMANTIC_POSITION,
    Entity,
    GSplatResource,
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
    entity: Entity;
    mesh: Mesh;
    material: ShaderMaterial;
    meshInstance: MeshInstance;
    splat: Splat;

    constructor() {
        super(ElementType.debug);
    }

    add() {
        const scene = this.scene;
        const device = scene.graphicsDevice;

        this.material = new ShaderMaterial({
            uniqueName: 'splatOverlayMaterial',
            attributes: { vertex_id: SEMANTIC_POSITION },
            vertexGLSL: vertexShader,
            fragmentGLSL: fragmentShader,
        });
        this.material.blendType = BLEND_NORMAL;
        this.material.depthWrite = false;
        this.material.depthTest = false;
        this.material.update();

        this.mesh = new Mesh(device);
        this.meshInstance = new MeshInstance(this.mesh, this.material, null);

        this.entity = new Entity('splatOverlay');
        this.entity.addComponent('render', {
            meshInstances: [this.meshInstance],
            layers: [scene.gizmoLayer.id]
        });

        scene.events.on('selection.changed', (selection: Splat) => {
            if (selection) {
                this.attach(selection);
            } else {
                this.detach();
            }
        });
    }

    destroy() {
        this.entity.remove();
        this.entity.destroy();
    }

    attach(splat: Splat) {
        const { mesh, material } = this;
        const { graphicsDevice } = this.scene;

        const splatData = splat.splatData;

        // TODO: make use of Splat's mapping instead of rendering all splats
        const vertexData = new Uint32Array(splatData.numSplats);
        for (let i = 0; i < splatData.numSplats; ++i) {
            vertexData[i] = i;
        }

        const vertexFormat = new VertexFormat(graphicsDevice, [{
            semantic: SEMANTIC_POSITION,
            components: 1,
            type: TYPE_UINT32,
            asInt: true
        }]);

        const vertexBuffer = new VertexBuffer(graphicsDevice, vertexFormat, splatData.numSplats, {
            usage: BUFFER_STATIC,
            data: vertexData.buffer
        });

        if (mesh.vertexBuffer) {
            mesh.vertexBuffer.destroy();
            mesh.vertexBuffer = null;
        }

        mesh.vertexBuffer = vertexBuffer;
        mesh.primitive[0] = {
            type: PRIMITIVE_POINTS,
            base: 0,
            baseVertex: 0,
            count: splatData.numSplats
        };

        material.setParameter('splatState', splat.stateTexture);
        material.setParameter('splatPosition', (splat.entity.gsplat.instance.resource as GSplatResource).transformATexture);
        material.setParameter('splatTransform', splat.transformTexture);
        material.setParameter('texParams', [splat.stateTexture.width, splat.stateTexture.height]);
        material.update();

        splat.entity.addChild(this.entity);
        this.splat = splat;
    }

    detach() {
        this.entity.remove();
    }

    onPreRender() {
        const { enabled, scene } = this;
        const { events } = scene;

        this.entity.enabled = enabled;

        if (enabled) {
            const { material, meshInstance } = this;
            const splatSize = events.invoke('camera.splatSize');
            const selectedClr = events.invoke('selectedClr');
            const unselectedClr = events.invoke('unselectedClr');
            
            material.setParameter('splatSize', splatSize * window.devicePixelRatio);
            material.setParameter('selectedClr', [selectedClr.r, selectedClr.g, selectedClr.b, selectedClr.a]);
            material.setParameter('unselectedClr', [unselectedClr.r, unselectedClr.g, unselectedClr.b, unselectedClr.a]);
            material.setParameter('transformPalette', this.splat.transformPalette.texture);
            material.update();
        }
    }

    get enabled() {
        const { scene } = this;
        const { events } = scene;
        return events.invoke('camera.splatSize') > 0 &&
            scene.camera.renderOverlays &&
            events.invoke('camera.overlay') &&
            events.invoke('camera.mode') === 'centers';
    }
}

export { SplatOverlay };
