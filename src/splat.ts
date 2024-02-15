import {
    Asset,
    BoundingBox,
    Entity,
    GSplatData,
    GSplatResource,
    Vec3
} from 'playcanvas';
import { Element, ElementType } from "./element";
import { Serializer } from "./serializer";

const vec = new Vec3();

class Splat extends Element {
    asset: Asset;
    splatData: GSplatData;
    entity: Entity;
    root: Entity;
    changedCounter = 0;

    constructor(asset: Asset) {
        super(ElementType.splat);

        const splatResource = asset.resource as GSplatResource;

        this.asset = asset;
        this.splatData = splatResource.splatData;
        this.entity = new Entity('splatRoot');
        this.root = splatResource.instantiate();

        // when sort changes, re-render the scene
        this.root.gsplat.instance.sorter.on('updated', () => {
            this.changedCounter++;
        });

        this.entity.addChild(this.root);
    }

    destroy() {
        super.destroy();
        this.entity.destroy();
        this.asset.registry.remove(this.asset);
        this.asset.unload();
    }

    get localBound() {
        return this.root.gsplat.instance.splat.aabb;
    }

    get worldBound() {
        return this.root.gsplat.instance.meshInstance.aabb;
    }

    get worldTransform() {
        return this.root.getWorldTransform();
    }

    add() {
        // add the entity to the scene
        this.scene.contentRoot.addChild(this.entity);

        const localBound = this.localBound;
        this.entity.setLocalPosition(localBound.center.x, localBound.center.y, localBound.center.z);
        this.root.setLocalPosition(-localBound.center.x, -localBound.center.y, -localBound.center.z);
    }

    remove() {
        this.scene.contentRoot.removeChild(this.entity);
    }

    serialize(serializer: Serializer) {
        serializer.packa(this.entity.getWorldTransform().data);
        serializer.pack(this.changedCounter);
    }

    calcBound(result: BoundingBox) {
        result.copy(this.worldBound);
        return true;
    }

    // recalculate the local space splat aabb and update engine/root transforms so it
    // remains centered on the splat but doesn't move in world space.
    recalcBound() {
        const localBound = this.localBound;

        // update splat data local bound
        const opacity = this.splatData.getProp('opacity');
        this.splatData.calcAabb(localBound, (i: number) => {
            return opacity[i] > -1000;
        });

        // calculate meshinstance aabb (transformed local bound)
        const meshInstance = this.root.gsplat.instance.meshInstance;
        meshInstance._aabb.setFromTransformedAabb(localBound, this.entity.getWorldTransform());

        // calculate movement in local space
        vec.add2(this.root.getLocalPosition(), localBound.center);
        this.entity.getWorldTransform().transformVector(vec, vec);
        vec.add(this.entity.getLocalPosition());

        // update transforms so base entity node is oriented to the center of the mesh
        this.entity.setLocalPosition(vec);
        this.root.setLocalPosition(-localBound.center.x, -localBound.center.y, -localBound.center.z);
    }

    focalPoint() {
        return this.asset.resource?.getFocalPoint?.();
    }
}

export { Splat };
