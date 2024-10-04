import { Quat, Vec3 } from 'playcanvas';
import { Events } from './events';
import { Splat } from './splat';
import { EntityTransform, EntityTransformOp } from './edit-ops';
import { TransformTarget } from './transform-target';

class EntityTransformTarget implements TransformTarget {
    events: Events;
    splat: Splat;
    op: EntityTransformOp;
    pivot: EntityTransform = {
        position: new Vec3(),
        rotation: new Quat(),
        scale: new Vec3()
    };

    constructor(events: Events) {
        this.events = events;

        this.events.on('splat.moved', (splat: Splat) => {
            if (splat === this.splat) {
                this.updatePivot();
                this.events.fire('transformTarget.moved', this);
            }
        });
    }

    updatePivot() {
        const pivot = this.splat.pivot;
        this.pivot.position.copy(pivot.getLocalPosition());
        this.pivot.rotation.copy(pivot.getLocalRotation());
        this.pivot.scale.copy(pivot.getLocalScale());
    }

    bind(splat: Splat) {
        this.splat = splat;
        this.updatePivot();
        this.events.fire('transformTarget.moved', this);
    }

    start() {
        const pivot = this.pivot;
        const p = pivot.position;
        const r = pivot.rotation;
        const s = pivot.scale;

        this.op = new EntityTransformOp({
            splat: this.splat,
            oldt: {
                position: p.clone(),
                rotation: r.clone(),
                scale: s.clone()
            },
            newt: {
                position: p.clone(),
                rotation: r.clone(),
                scale: s.clone()
            }
        });
    }

    update(position?: Vec3, rotation?: Quat, scale?: Vec3) {
        const newt = this.op.newt;

        if (position) {
            newt.position.copy(position);
        }
        if (rotation) {
            newt.rotation.copy(rotation);
        }
        if (scale) {
            newt.scale.copy(scale);
        }

        this.op.do();
    }

    end() {
        // if anything changed them register the op with undo/redo system
        const { oldt, newt } = this.op;

        if (!oldt.position.equals(newt.position) ||
            !oldt.rotation.equals(newt.rotation) ||
            !oldt.scale.equals(newt.scale)) {

            this.events.fire('edit.add', this.op);
        }

        this.op = null;
    }
}

const registerEntityTransformTargetEvents = (events: Events) => {
    const entityTransformTarget = new EntityTransformTarget(events);

    events.on('selection.changed', (splat) => {
        if (splat) {
            entityTransformTarget.bind(splat);
            events.fire('transformTarget', entityTransformTarget);
        }
    });
};

export { registerEntityTransformTargetEvents };