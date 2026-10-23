import { Asset, BoundingBox, Color, ContainerResource, Entity, MeshInstance, Quat, Vec3 } from 'playcanvas';

import { Element, ElementType } from './element';
import { Scene } from './scene';
import { Serializer } from './serializer';

// Models are lit by one directional key light plus ambient. Splats are unlit, so
// the light only exists while the scene holds at least one model.
const lightUsers = new WeakMap<Scene, { entity: Entity, ambient: Color, count: number }>();

const retainLight = (scene: Scene) => {
    let entry = lightUsers.get(scene);
    if (!entry) {
        const entity = new Entity('modelLight');
        entity.addComponent('light', {
            type: 'directional',
            color: new Color(1, 1, 1),
            intensity: 1,
            castShadows: false,
            layers: [scene.worldLayer.id]
        });
        entity.setEulerAngles(45, 35, 0);
        scene.app.root.addChild(entity);
        const ambient = scene.app.scene.ambientLight.clone();
        scene.app.scene.ambientLight = new Color(0.45, 0.45, 0.45);
        entry = { entity, ambient, count: 0 };
        lightUsers.set(scene, entry);
    }
    entry.count++;
};

const releaseLight = (scene: Scene) => {
    const entry = lightUsers.get(scene);
    if (entry && --entry.count === 0) {
        entry.entity.destroy();
        scene.app.scene.ambientLight = entry.ambient;
        lightUsers.delete(scene);
    }
};

// A glTF/GLB model shown alongside the splats as a reference, for example a
// design model to compare against a scan. The original file bytes are kept so
// the model can be written to the project file unchanged.
class Model extends Element {
    asset: Asset;
    entity: Entity;
    contents: ArrayBuffer;
    filename: string;
    _name: string;
    _visible = true;
    worldBoundStorage = new BoundingBox();

    constructor(asset: Asset, contents: ArrayBuffer, filename: string) {
        super(ElementType.model);
        this.asset = asset;
        this.contents = contents;
        this.filename = filename;
        this._name = filename.split('/').pop();

        const resource = asset.resource as ContainerResource;
        this.entity = resource.instantiateRenderEntity();
        this.entity.name = this._name;
    }

    add() {
        this.scene.contentRoot.addChild(this.entity);
        this.entity.enabled = this._visible;
        retainLight(this.scene);
        this.scene.boundDirty = true;
    }

    remove() {
        this.entity.parent?.removeChild(this.entity);
        releaseLight(this.scene);
        this.scene.boundDirty = true;
    }

    destroy() {
        super.destroy();
        this.entity.destroy();
        this.asset.registry?.remove(this.asset);
        this.asset.unload();
    }

    serialize(serializer: Serializer) {
        serializer.packa(this.entity.getWorldTransform().data);
        serializer.pack(this._visible);
    }

    move(position?: Vec3, rotation?: Quat, scale?: Vec3) {
        if (position) {
            this.entity.setLocalPosition(position);
        }
        if (rotation) {
            this.entity.setLocalRotation(rotation);
        }
        if (scale) {
            this.entity.setLocalScale(scale);
        }
        if (this.scene) {
            this.scene.boundDirty = true;
        }
    }

    get worldBound() {
        let valid = false;
        this.entity.findComponents('render').forEach((render: any) => {
            render.meshInstances.forEach((mi: MeshInstance) => {
                if (!valid) {
                    valid = true;
                    this.worldBoundStorage.copy(mi.aabb);
                } else {
                    this.worldBoundStorage.add(mi.aabb);
                }
            });
        });
        return valid ? this.worldBoundStorage : null;
    }

    set name(value: string) {
        if (value !== this._name) {
            this._name = value;
            this.entity.name = value;
            this.scene?.events.fire('model.name', this);
        }
    }

    get name() {
        return this._name;
    }

    set visible(value: boolean) {
        if (value !== this._visible) {
            this._visible = value;
            this.entity.enabled = value;
            this.scene?.events.fire('model.visibility', this);
        }
    }

    get visible() {
        return this._visible;
    }

    docSerialize() {
        const pack3 = (v: Vec3) => [v.x, v.y, v.z];
        const pack4 = (q: Quat) => [q.x, q.y, q.z, q.w];
        return {
            name: this.name,
            position: pack3(this.entity.getLocalPosition()),
            rotation: pack4(this.entity.getLocalRotation()),
            scale: pack3(this.entity.getLocalScale()),
            visible: this.visible
        };
    }

    docDeserialize(doc: any) {
        const { name, position, rotation, scale, visible } = doc;
        this.name = name;
        this.move(new Vec3(position), new Quat(rotation), new Vec3(scale));
        this.visible = visible;
    }
}

export { Model };
