import { Mat4, Vec3 } from 'playcanvas';
import { Events } from './events';
import { Splat } from './splat';
import { Transform } from './transform';
import { PlacePivotOp, SplatsTransformOp, MultiOp } from './edit-ops';
import { TransformHandler } from './transform-handler';
import { Pivot } from './pivot';

const mat = new Mat4();
const vec = new Vec3();
const transform = new Transform();

class SplatsTransformHandler implements TransformHandler {
    events: Events;
    splat: Splat;
    pivotStart = new Transform();
    localToPivot = new Mat4();
    worldToLocal = new Mat4();

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

        events.on('selection.changed', (splat) => {
            if (this.splat && splat === this.splat) {
                this.placePivot();
            }
        });

        events.on('splat.stateChanged', (splat: Splat) => {
            if (this.splat && splat === this.splat) {
                this.placePivot();
            }
        });

        events.on('camera.focalPointPicked', (details: { splat: Splat, position: Vec3 }) => {
            if (this.splat) {
                const pivot = events.invoke('pivot') as Pivot;
                const oldt = pivot.transform.clone();
                const newt = new Transform(details.position, pivot.transform.rotation, pivot.transform.scale);
                const op = new PlacePivotOp({ pivot, oldt, newt });
                events.fire('edit.add', op);
            }
        });
    }

    placePivot() {
        const { splat } = this;
        const { entity } = splat;

        // place the pivot at the center of the selected splats
        entity.getLocalTransform().transformPoint(splat.selectionBound.center, vec);
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
        const { splat } = this;

        mat.setTRS(transform.position, transform.rotation, transform.scale);

        // calculate local -> pivot transform
        this.localToPivot.invert(mat);
        this.localToPivot.mul2(this.localToPivot, splat.entity.getLocalTransform());

        // calculate the world -> local transform
        this.worldToLocal.invert(splat.entity.getLocalTransform());

        this.pivotStart.copy(transform);
    }

    update(transform: Transform) {
        // calculate updated new pivot -> world transform
        mat.setTRS(transform.position, transform.rotation, transform.scale);
        mat.mul2(mat, this.localToPivot);       // local -> world
        mat.mul2(this.worldToLocal, mat);       // world -> local

        this.splat.selectionTransform.copy(mat);
        this.splat.scene.forceRender = true;
    }

    end() {
        const pivot = this.events.invoke('pivot') as Pivot;

        // create op to apply this transform
        const top = new SplatsTransformOp({
            splat: this.splat,
            transform: this.splat.selectionTransform.clone()
        });

        const oldt = this.pivotStart.clone();
        const newt = pivot.transform.clone();
        const pop = new PlacePivotOp({ pivot, newt, oldt });

        // adding to edit history will apply the op
        this.events.fire('edit.add', new MultiOp([top, pop]));

        // reset shader's selection transform
        this.splat.selectionTransform.setIdentity();
    }
};

export { SplatsTransformHandler };
