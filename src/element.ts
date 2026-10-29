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
        const scene = this.scene;
        if (scene) {
            scene.remove(this);
            // distinct from 'scene.elementRemoved': an element also leaves the
            // scene when an AddSplatOp is undone, and that op is exactly what
            // redo needs, so history must only be pruned once the element is
            // actually gone for good
            scene.events.fire('scene.elementDestroyed', this);
        }
    }

    add(): void | Promise<void> {
        // overridden by subclasses
    }

    remove() {
        // overridden by subclasses
    }

    serialize(_serializer: Serializer) {
        // overridden by subclasses
    }

    onUpdate(_deltaTime: number) {
        // overridden by subclasses
    }

    onPostUpdate() {
        // overridden by subclasses
    }

    onPreRender() {
        // overridden by subclasses
    }

    onPostRender() {
        // overridden by subclasses
    }

    onAdded(_element: Element) {
        // overridden by subclasses
    }

    onRemoved(_element: Element) {
        // overridden by subclasses
    }

    move(_position?: Vec3, _rotation?: Quat, _scale?: Vec3) {
        // overridden by subclasses
    }

    // eslint-disable-next-line @typescript-eslint/class-literal-property-style -- subclasses override this getter
    get worldBound(): BoundingBox | null {
        return null;
    }
}

export { ElementType, ElementTypeList, Element };
