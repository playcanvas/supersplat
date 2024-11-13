import {
    Asset,
    BoundingBox,
    Entity,
    MeshInstance,
    RenderComponent,
    Vec3
} from 'playcanvas';

import { Element, ElementType } from './element';
import { Serializer } from './serializer';

const vec = new Vec3();

// calculate mesh sort distance by node origin (instead of the default bounding box origin)
const calculateSortDistance = (drawCall: any, cameraPosition: Vec3, cameraForward: Vec3) => {
    return vec.sub2(drawCall.node.getPosition(), cameraPosition).dot(cameraForward);
};

class Model extends Element {
    asset: Asset;
    entity: Entity;
    root: any;
    animTracks: string[] = [];
    changedCounter = 0;
    worldBoundStorage = new BoundingBox();

    constructor(asset: Asset) {
        super(ElementType.model);

        this.asset = asset;
        this.entity = new Entity('modelRoot');
    }

    play(track?: number) {
        const anim = this.root.anim;
        if (anim) {
            if (track) {
                anim.baseLayer.transition(`track_${track}`);
            }
            anim.playing = true;
            anim.baseLayer.play();
        }
    }

    pause() {
        const anim = this.root.anim;
        if (anim) {
            anim.playing = false;
            anim.baseLayer.pause();
        }
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
            app: this.scene.app,
            camera: this.scene.camera.entity,
            onChanged: () => {
                this.changedCounter++;
            }
        });
        this.entity.addChild(this.root);

        // initialize animations
        if (this.asset.resource.animations?.length > 0) {
            const anim = this.root.addComponent('anim', {
                activate: false,
                speed: 1.0
            });

            anim.rootBone = this.root;
            this.asset.resource.animations.forEach((animTrack: any, i: number) => {
                anim.assignAnimation(`track_${i}`, animTrack.resource);
                this.animTracks.push(animTrack.resource.name);
            });

            // automatically play the first animation
            this.play(0);
        }

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

        vec.copy(Vec3.ZERO);

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

        this.scene.boundDirty = true;
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

    get worldBound() {
        const bound = this.worldBoundStorage;

        let valid = false;
        this.entity.findComponents('render').forEach((r: RenderComponent) => {
            if (r.entity.enabled) {
                r.meshInstances.forEach((meshInstance: MeshInstance) => {
                    if (!valid) {
                        valid = true;
                        bound.copy(meshInstance.aabb);
                    } else {
                        bound.add(meshInstance.aabb);
                    }
                });
            }
        });

        return valid ? bound : null;
    }
}

export { Model };
