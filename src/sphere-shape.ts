import { BoundingBox, Color, Entity, Vec3 } from 'playcanvas';
import { Element, ElementType } from './element';
import { Serializer } from './serializer';

const v = new Vec3();
const bound = new BoundingBox();

class SphereShape extends Element {
    pivot: Entity;
    _radius = 1;

    constructor() {
        super(ElementType.debug);

        this.pivot = new Entity('spherePivot');
    }

    add() {
        this.scene.contentRoot.addChild(this.pivot);
        this.updateBound();
    }

    remove() {
        this.scene.contentRoot.removeChild(this.pivot);
        this.scene.boundDirty = true;
    }

    destroy() {

    }

    serialize(serializer: Serializer): void {
        serializer.packa(this.pivot.getWorldTransform().data);
        serializer.pack(this.radius);
    }

    onPreRender() {
        this.pivot.getWorldTransform().getTranslation(v)
        this.scene.app.drawWireSphere(v, this.radius, Color.RED, 40);
    }

    moved() {
        this.updateBound();
    }

    updateBound() {
        bound.center.copy(this.pivot.getPosition());
        bound.halfExtents.set(this.radius, this.radius, this.radius);
        this.scene.boundDirty = true;
    }

    get worldBound(): BoundingBox | null {
        return bound;
    }

    set radius(radius: number) {
        this._radius = radius;
        this.updateBound();
    }

    get radius() {
        return this._radius;
    }
};

export { SphereShape };
