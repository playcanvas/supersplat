import type { BoundingBox, Quat, Vec3 } from 'playcanvas';

import type { Scene } from './scene';
import type { Serializer } from './serializer';

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

    add(): void | Promise<void> {
        // no-op
    }

    remove() {
        // no-op
    }

    serialize(serializer: Serializer) {
        // no-op
    }

    onUpdate(deltaTime: number) {
        // no-op
    }

    onPostUpdate() {
        // no-op
    }

    onPreRender() {
        // no-op
    }

    onPostRender() {
        // no-op
    }

    onAdded(element: Element) {
        // no-op
    }

    onRemoved(element: Element) {
        // no-op
    }

    move(position?: Vec3, rotation?: Quat, scale?: Vec3) {
        // no-op
    }

    // eslint-disable-next-line @typescript-eslint/class-literal-property-style
    get worldBound(): BoundingBox | null {
        return null;
    }
}

export { ElementType, ElementTypeList, Element };
