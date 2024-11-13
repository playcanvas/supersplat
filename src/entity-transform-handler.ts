import { Mat4, Quat, Vec3 } from 'playcanvas';

import { PlacePivotOp, EntityTransformOp, MultiOp } from './edit-ops';
import { Events } from './events';
import { Pivot } from './pivot';
import { Splat } from './splat';
import { Transform } from './transform';
import { TransformHandler } from './transform-handler';

const vec = new Vec3();
const mat = new Mat4();
const quat = new Quat();
const transform = new Transform();

class EntityTransformHandler implements TransformHandler {
    events: Events;
    splat: Splat;
    top: EntityTransformOp;
    pop: PlacePivotOp;
    bindMat = new Mat4();

    constructor(events: Events) {
        this.events = events;

        events.on('pivot.started', (pivot: Pivot) => {
            if (this.splat) {
                this.start();
            }
        });

        events.on('pivot.moved', (pivot: Pivot) => {
            if (this.splat) {
                this.update(pivot.transform);
            }
        });

        events.on('pivot.ended', (pivot: Pivot) => {
            if (this.splat) {
                this.end();
            }
        });

        events.on('camera.focalPointPicked', (details: { splat: Splat, position: Vec3 }) => {
            if (this.splat) {
                const pivot = events.invoke('pivot') as Pivot;
                const newt = new Transform(details.position, pivot.transform.rotation, pivot.transform.scale);
                const op = new PlacePivotOp({ pivot, oldt: pivot.transform.clone(), newt });
                events.fire('edit.add', op);
            }
        });
    }

    placePivot() {
        // place initial pivot point
        const { entity } = this.splat;
        entity.getLocalTransform().transformPoint(this.splat.localBound.center, vec);
        transform.set(vec, entity.getLocalRotation(), entity.getLocalScale());
        this.events.fire('pivot.place', transform);
    }

    activate() {
        this.splat = this.events.invoke('selection') as Splat;
        if (this.splat) {
            this.placePivot();
        }
    }

    deactivate() {
        this.splat = null;
    }

    start() {
        const pivot = this.events.invoke('pivot') as Pivot;
        const { transform } = pivot;
        const { entity } = this.splat;

        // calculate bind matrix
        this.bindMat.setTRS(transform.position, transform.rotation, transform.scale);
        this.bindMat.invert();
        this.bindMat.mul2(this.bindMat, entity.getLocalTransform());

        const p = entity.getLocalPosition();
        const r = entity.getLocalRotation();
        const s = entity.getLocalScale();

        // create op
        this.top = new EntityTransformOp({
            splat: this.splat,
            oldt: new Transform(p, r, s),
            newt: new Transform(p, r, s)
        });

        this.pop = new PlacePivotOp({
            pivot,
            oldt: transform.clone(),
            newt: transform.clone()
        });
    }

    update(transform: Transform) {
        mat.setTRS(transform.position, transform.rotation, transform.scale);
        mat.mul2(mat, this.bindMat);
        quat.setFromMat4(mat);

        const t = mat.getTranslation();
        const r = quat;
        const s = mat.getScale();

        this.splat.move(t, r, s);
        this.top.newt.set(t, r, s);
        this.pop.newt.copy(transform);
    }

    end() {
        // if anything changed then register the op with undo/redo system
        const { oldt, newt } = this.top;

        if (!oldt.equals(newt)) {
            this.events.fire('edit.add', new MultiOp([this.top, this.pop]));
        }

        this.top = null;
        this.pop = null;
    }
}

export { EntityTransformHandler };
