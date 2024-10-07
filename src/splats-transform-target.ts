import { Mat4, Quat, Vec3 } from 'playcanvas';
import { Events } from './events';
import { Splat } from './splat';
import { EntityTransform, SplatsTransformOp } from './edit-ops';
import { TransformTarget } from './transform-target';

const mat = new Mat4();
const vec = new Vec3();

class SplatsTransformTarget implements TransformTarget {
    events: Events;
    splat: Splat;
    pivot: EntityTransform = {
        position: new Vec3(),
        rotation: new Quat(),
        scale: new Vec3()
    };
    localToPivot = new Mat4();
    worldToLocal = new Mat4();

    constructor(events: Events) {
        this.events = events;

        events.on('camera.focalPointPicked', (details: { splat: Splat, position: Vec3 }) => {
            this.pivot.position.copy(details.position);
            this.events.fire('transformTarget.moved', this);
        });
    }

    updatePivot() {
        const { splat, pivot } = this;

        // get world space position of the center of splat's selection
        splat.entity.getWorldTransform().transformPoint(splat.selectionBound.center, pivot.position);
        pivot.rotation.copy(splat.pivot.getLocalRotation());
        pivot.scale.copy(splat.pivot.getLocalScale());

        this.events.fire('transformTarget.moved', this);
    }

    bind() {
        this.splat = this.events.invoke('selection') as Splat;
        if (this.splat) {
            this.updatePivot();
        }
    }

    unbind () {
        this.splat = null;
    }

    start() {
        const { splat } = this;
        const c = splat.selectionBound.center;

        splat.entity.getLocalTransform().transformPoint(c, vec);

        // calculate the local -> pivot transform taking into consideration the pivot's center
        this.localToPivot.setTranslate(-vec.x, -vec.y, -vec.z);
        this.localToPivot.mul2(this.localToPivot, splat.entity.getLocalTransform());

        // calculate the world -> local transform
        this.worldToLocal.setTRS(this.pivot.position, this.pivot.rotation, this.pivot.scale);
        this.worldToLocal.mul2(this.worldToLocal, this.localToPivot);
        this.worldToLocal.invert();
    }

    update(position?: Vec3, rotation?: Quat, scale?: Vec3) {
        // calculate updated new pivot -> world transform
        mat.setTRS(position ?? this.pivot.position, rotation ?? this.pivot.rotation, scale ?? this.pivot.scale);
        mat.mul2(mat, this.localToPivot);       // local -> world
        mat.mul2(this.worldToLocal, mat);       // world -> local

        this.splat.selectionTransform.copy(mat);
        this.splat.scene.forceRender = true;
    }

    end() {
        // create op to apply this transform
        const op = new SplatsTransformOp({ splat: this.splat, transform: this.splat.selectionTransform });

        // adding to edit history will apply the op
        this.events.fire('edit.add', op);

        // reset shader's selection transform
        this.splat.selectionTransform.setIdentity();
    }
};

export { SplatsTransformTarget };
