import {
    BLEND_NONE,
    FUNC_LESS,
    PRIMITIVE_TRIANGLES,
    SEMANTIC_POSITION,
    Entity,
    ShaderMaterial,
    Mesh,
    MeshInstance
} from 'playcanvas';

import { ElementType, Element } from './element';
import { vertexShader, fragmentShader } from './shaders/splat-centers-shader';
import { Splat } from './splat';

class SplatCenters extends Element {
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
            uniqueName: 'splatCentersMaterial',
            attributes: {
                vertex_position: SEMANTIC_POSITION
            },
            vertexWGSL: vertexShader,
            fragmentWGSL: fragmentShader
        });
        // opaque and depth resolved: centers own the depth buffer of their layer,
        // so each pixel keeps the frontmost center whatever order the instances
        // draw in. Blending them instead makes the result order-dependent - a
        // pixel takes one blend or several depending on which center reached it
        // first - which reads as patches of differing density across a large
        // scene. FUNC_LESS matters: the LESSEQUAL default admits every coincident
        // fragment, putting the overdraw cost straight back
        this.material.blendType = BLEND_NONE;
        this.material.depthWrite = true;
        this.material.depthTest = true;
        this.material.depthFunc = FUNC_LESS;
        this.material.update();

        this.mesh = new Mesh(device);
        this.mesh.setPositions([-1, -1, 1, -1, 1, 1, -1, 1], 2);
        this.mesh.setIndices([0, 1, 2, 0, 2, 3]);
        this.mesh.update(PRIMITIVE_TRIANGLES);

        this.meshInstance = new MeshInstance(this.mesh, this.material, null);
        this.meshInstance.setInstancing(true, false);
        // disable frustum culling since mesh has no vertex buffer for AABB calculation
        this.meshInstance.cull = false;

        this.entity = new Entity('splatCenters');
        this.entity.addComponent('render', {
            meshInstances: [this.meshInstance],
            layers: [scene.centersLayer.id]
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
            // delete/undo resizes the instance list, so the draw count is per-frame
            this.meshInstance.instancingCount = this.splat.instances.count;
            const centerSize = events.invoke('view.centerSize');
            const selectedClr = events.invoke('selectedClr');
            const unselectedClr = events.invoke('unselectedClr');
            // the edit view switch (tab) hides the non-selection centers;
            // selection centers stay visible
            const showAllCenters = events.invoke('view.centers') && events.invoke('view.editView');

            material.setParameter('centerSize', centerSize * window.devicePixelRatio);
            material.setParameter('viewportSize', [scene.targetSize.width, scene.targetSize.height]);
            material.setParameter('selectionOnly', showAllCenters ? 0 : 1);
            material.setParameter('selectionCenters', events.invoke('view.selectionCenters') ? 1 : 0);
            material.setParameter('selectedClr', [selectedClr.r, selectedClr.g, selectedClr.b, selectedClr.a]);
            material.setParameter('unselectedClr', [unselectedClr.r, unselectedClr.g, unselectedClr.b, unselectedClr.a]);
            material.setParameter('colorBlend', events.invoke('view.centersColorBlend'));
            material.setParameter('selectionBlend', events.invoke('view.centersSelectionBlend'));
            material.setParameter('transformPalette', this.splat.transformPalette.texture);

            // pass camera position for SH evaluation
            const camPos = scene.camera.mainCamera.getPosition();
            material.setParameter('view_position', [camPos.x, camPos.y, camPos.z]);
        }
    }

    get enabled() {
        const { scene, splat } = this;
        const { events } = scene;
        const showAllCenters = events.invoke('view.centers') && events.invoke('view.editView');
        const showSelectedCenters = events.invoke('view.selectionCenters') && (splat?.instances.numSelected ?? 0) > 0;
        return splat &&
            events.invoke('view.centerSize') > 0 &&
            scene.camera.renderOverlays &&
            (showAllCenters || showSelectedCenters);
    }
}

export { SplatCenters };
