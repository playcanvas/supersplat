import {
    Asset,
    BoundingBox,
    Entity,
    MeshInstance,
    RenderComponent,
    Vec3
} from 'playcanvas';
import { Element, ElementType } from "./element";
import { Serializer } from "./serializer";

const vec = new Vec3();
const bound = new BoundingBox();

// calculate mesh sort distance by node origin (instead of the default bounding box origin)
const calculateSortDistance = (drawCall: any, cameraPosition: Vec3, cameraForward: Vec3) => {
    return vec.sub2(drawCall.node.getPosition(), cameraPosition).dot(cameraForward);
};

class Splat extends Element {
    asset: Asset;
    entity: Entity;
    root: any;
    changedCounter = 0;

    constructor(asset: Asset) {
        super(ElementType.splat);

        this.asset = asset;
        this.entity = new Entity('splatRoot');
    }

    destroy() {
        super.destroy();
        this.entity.destroy();
        this.asset.registry.remove(this.asset);
        this.asset.unload();
    }

    add() {
        const config = this.scene.config;

        this.root = this.asset.resource.instantiateRenderEntity({
            cameraEntity: this.scene.camera.entity
        });

        // when sort changes, re-render the scene
        this.root.render.meshInstances[0].splatInstance.sorter.on('updated', () => {
            this.changedCounter++;
        });

        this.entity.addChild(this.root);

        // add the entity to the scene
        this.scene.contentRoot.addChild(this.entity);

        // manually add shadow casters to shadow layer
        this.entity.findComponents('render').forEach((component: RenderComponent) => {
            if (component.entity.enabled) {
                this.scene.shadowLayer.shadowCasters = this.scene.shadowLayer.shadowCasters.concat(
                    component.meshInstances
                );
            }

            // override default sort distance calculation
            component.meshInstances.forEach((meshInstance: MeshInstance) => {
                meshInstance.calculateSortDistance = calculateSortDistance;
            });
        });

        this.calcBound(bound);

        // center the object to the world origin
        // if (bound) {
        //     vec.set(-bound.center.x, -bound.getMin().y, -bound.center.z);
        // } else {
        //     vec.copy(Vec3.ZERO);
        // }

        // apply model settings
        const p = config.model.position;
        const r = config.model.rotation;
        const s = config.model.scale;

        if (p) {
            vec.x += p.x;
            vec.y += p.y;
            vec.z += p.z;
        }
        this.entity.setLocalPosition(vec.x, vec.y, vec.z);
        if (r) this.entity.setLocalEulerAngles(r.x, r.y, r.z);
        if (s) this.entity.setLocalScale(s, s, s);
    }

    remove() {
        this.entity.findComponents('render').forEach((component: RenderComponent) => {
            this.scene.shadowLayer.shadowCasters = this.scene.shadowLayer.shadowCasters.filter(
                (meshInstance: MeshInstance) => {
                    return component.meshInstances.indexOf(meshInstance) === -1;
                }
            );
        });
        this.scene.contentRoot.removeChild(this.entity);
    }

    serialize(serializer: Serializer) {
        serializer.packa(this.entity.getWorldTransform().data);
        serializer.pack(this.root?.anim?.baseLayer?.activeStateCurrentTime);
        serializer.pack(this.changedCounter);
    }

    calcBound(result: BoundingBox) {
        let valid = false;
        this.entity.findComponents('render').forEach((r: RenderComponent) => {
            if (r.entity.enabled) {
                r.meshInstances.forEach((meshInstance: MeshInstance) => {
                    if (!valid) {
                        valid = true;
                        result.copy(meshInstance.aabb);
                    } else {
                        result.add(meshInstance.aabb);
                    }
                });
            }
        });
        return valid;
    }

    focalPoint() {
        return this.asset.resource?.getFocalPoint?.();
    }
}

export { Splat };
