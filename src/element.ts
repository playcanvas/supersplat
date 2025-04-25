import { BoundingBox, Quat, Vec3 } from 'playcanvas';

import { Scene } from './scene';
import { Serializer } from './serializer';

enum ElementType {
    camera = 'camera',
    model = 'model',
    splat = 'splat',
    shadow = 'shadow',
    debug = 'debug',
    other = 'other'
}

const ElementTypeList = [
    ElementType.camera,
    ElementType.model,
    ElementType.splat,
    ElementType.shadow,
    ElementType.debug,
    ElementType.other
];

let nextUid = 1;

class Element {
    type: ElementType;
    scene: Scene = null;
    uid: number;

    constructor(type: ElementType) {
        this.type = type;
        this.uid = nextUid++;
    }

    destroy() {
        if (this.scene) {
            this.scene.remove(this);
        }
    }

    add() {}

    remove() {}

    serialize(serializer: Serializer) {}

    onUpdate(deltaTime: number) {}

    onPostUpdate() {}

    onPreRender() {}

    onPostRender() {}

    onAdded(element: Element) {}

    onRemoved(element: Element) {}

    move(position?: Vec3, rotation?: Quat, scale?: Vec3) {}

    get worldBound(): BoundingBox | null {
        return null;
    }
}

export { ElementType, ElementTypeList, Element };
