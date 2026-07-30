import {
    BLEND_NORMAL,
    PRIMITIVE_TRIANGLES,
    SEMANTIC_POSITION,
    Color,
    Entity,
    ShaderMaterial,
    Mesh,
    MeshInstance
} from 'playcanvas';

import { ElementType, Element } from './element';
import { vertexShader, fragmentShader } from './shaders/splat-overlay-shader';
import { Splat } from './splat';

const nullClr = new Color(0, 0, 0, 0);

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
            attributes: {
                vertex_position: SEMANTIC_POSITION
            },
            vertexWGSL: vertexShader,
            fragmentWGSL: fragmentShader
        });
        this.material.blendType = BLEND_NORMAL;
        this.material.depthWrite = false;
        this.material.depthTest = true;
        this.material.update();

        this.mesh = new Mesh(device);
        this.mesh.setPositions([-1, -1, 1, -1, 1, 1, -1, 1], 2);
        this.mesh.setIndices([0, 1, 2, 0, 2, 3]);
        this.mesh.update(PRIMITIVE_TRIANGLES);

        this.meshInstance = new MeshInstance(this.mesh, this.material, null);
        this.meshInstance.setInstancing(true, false);
        // slightly higher priority so it renders before gizmos
        this.meshInstance.drawBucket = 128;
        // disable frustum culling since mesh has no vertex buffer for AABB calculation
        this.meshInstance.cull = false;

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

        // re-attach when the attached splat swaps its frame data (animated
        // sequence): replaceData builds a new entity/instance, so our captured
        // instance and our entity (parented under the old one) are stale.
        scene.events.on('splat.replaced', (splat: Splat) => {
            if (this.splat === splat) {
                this.attach(splat);
            }
        });
    }

    destroy() {
        this.detach();
        this.entity.destroy();
    }

    attach(splat: Splat) {
        // detach from previous splat first
        this.detach();

        const { mesh, material } = this;

        // set up other uniforms
        const resource = splat.resource;
        const positionTexture = (resource as any).getTexture('transformA');
        material.setParameter('instanceSource', splat.instances.instanceSource);
        material.setParameter('instanceFlags', splat.instances.instanceFlags);
        material.setParameter('instancePalette', splat.instances.instancePalette);
        material.setParameter('instanceBase', 0);
        material.setParameter('splatPosition', positionTexture);
        material.setParameter('splatColor', (resource as any).getTexture('splatColor'));
        material.setParameter('texParams', [positionTexture.width, positionTexture.height]);

        // set up SH textures and define based on SH bands
        const shBands = resource.shBands;
        material.setDefine('SH_BANDS', `${shBands}`);
        if (shBands > 0) {
            material.setParameter('splatSH_1to3', (resource as any).getTexture('splatSH_1to3'));
            if (shBands > 1) {
                material.setParameter('splatSH_4to7', (resource as any).getTexture('splatSH_4to7'));
                material.setParameter('splatSH_8to11', (resource as any).getTexture('splatSH_8to11'));
                if (shBands > 2) {
                    material.setParameter('splatSH_12to15', (resource as any).getTexture('splatSH_12to15'));
                }
            }
        }

        material.update();

        this.meshInstance.instancingCount = splat.instances.count;

        splat.entity.addChild(this.entity);
        this.splat = splat;
    }

    detach() {
        this.entity.remove();
        this.splat = null;
    }

    onPreRender() {
        const { enabled, scene } = this;
        const { events } = scene;

        this.entity.enabled = enabled;

        if (enabled) {
            const { material } = this;
            const splatSize = events.invoke('camera.splatSize');
            const selectedClr = events.invoke('view.outlineSelection') ? nullClr : events.invoke('selectedClr');
            const unselectedClr = events.invoke('unselectedClr');
            const useGaussianColor = events.invoke('view.centersUseGaussianColor') ? 1.0 : 0.0;

            material.setParameter('splatSize', splatSize * window.devicePixelRatio);
            material.setParameter('viewportSize', [scene.targetSize.width, scene.targetSize.height]);
            material.setParameter('selectedClr', [selectedClr.r, selectedClr.g, selectedClr.b, selectedClr.a]);
            material.setParameter('unselectedClr', [unselectedClr.r, unselectedClr.g, unselectedClr.b, unselectedClr.a]);
            material.setParameter('useGaussianColor', useGaussianColor);
            material.setParameter('transformPalette', this.splat.transformPalette.texture);

            // pass camera position for SH evaluation
            const camPos = scene.camera.mainCamera.getPosition();
            material.setParameter('view_position', [camPos.x, camPos.y, camPos.z]);
        }
    }

    get enabled() {
        const { scene, splat } = this;
        const { events } = scene;
        return splat &&
            events.invoke('camera.splatSize') > 0 &&
            scene.camera.renderOverlays &&
            events.invoke('camera.overlay') &&
            events.invoke('camera.mode') === 'centers';
    }
}

export { SplatOverlay };
