import { GSplatData, Mat4, Quat, Vec3 } from 'playcanvas';
import { Splat } from './splat';
import { State } from './splat-state';

interface EditOp {
    name: string;
    do(): void;
    undo(): void;
    destroy?(): void;
}

// build a splat index based on a boolean predicate
const buildIndex = (splatData: GSplatData, pred: (i: number) => boolean) => {
    let numSplats = 0;
    for (let i = 0; i < splatData.numSplats; ++i) {
        if (pred(i)) numSplats++;
    }

    const result = new Uint32Array(numSplats);
    let idx = 0;
    for (let i = 0; i < splatData.numSplats; ++i) {
        if (pred(i)) {
            result[idx++] = i;
        }
    }

    return result;
};

class DeleteSelectionEditOp {
    name = 'deleteSelection';
    splat: Splat;
    indices: Uint32Array;

    constructor(splat: Splat) {
        const splatData = splat.splatData;
        const state = splatData.getProp('state') as Uint8Array;
        const indices = buildIndex(splatData, (i) => !!(state[i] & State.selected));

        this.splat = splat;
        this.indices = indices;
    }

    do() {
        const splatData = this.splat.splatData;
        const state = splatData.getProp('state') as Uint8Array;
        for (let i = 0; i < this.indices.length; ++i) {
            state[this.indices[i]] |= State.deleted;
        }
        this.splat.updateState(State.deleted);
    }

    undo() {
        const splatData = this.splat.splatData;
        const state = splatData.getProp('state') as Uint8Array;
        for (let i = 0; i < this.indices.length; ++i) {
            state[this.indices[i]] &= ~State.deleted;
        }
        this.splat.updateState(State.deleted);
    }

    destroy() {
        this.splat = null;
        this.indices = null;
    }
}

class ResetEditOp {
    name = 'reset';
    splat: Splat;
    indices: Uint32Array;

    constructor(splat: Splat) {
        const splatData = splat.splatData;
        const state = splatData.getProp('state') as Uint8Array;
        const indices = buildIndex(splatData, (i) => !!(state[i] & State.deleted));

        this.splat = splat;
        this.indices = indices;
    }

    do() {
        const splatData = this.splat.splatData;
        const state = splatData.getProp('state') as Uint8Array;
        for (let i = 0; i < this.indices.length; ++i) {
            state[this.indices[i]] &= ~State.deleted;
        }
        this.splat.updateState(State.deleted);
    }

    undo() {
        const splatData = this.splat.splatData;
        const state = splatData.getProp('state') as Uint8Array;
        for (let i = 0; i < this.indices.length; ++i) {
            state[this.indices[i]] |= State.deleted;
        }
        this.splat.updateState(State.deleted);
    }

    destroy() {
        this.splat = null;
        this.indices = null;
    }
}

interface EntityTransform {
    position?: Vec3;
    rotation?: Quat;
    scale?: Vec3;
}

class EntityTransformOp {
    name = 'entityTransform';

    splat: Splat;
    oldt: EntityTransform;
    newt: EntityTransform;

    constructor(options: { splat: Splat, oldt: EntityTransform, newt: EntityTransform }) {
        this.splat = options.splat;
        this.oldt = options.oldt;
        this.newt = options.newt;
    }

    do() {
        this.splat.move(this.newt.position, this.newt.rotation, this.newt.scale);
    }

    undo() {
        this.splat.move(this.oldt.position, this.oldt.rotation, this.oldt.scale);
    }

    destroy() {
        this.splat = null;
        this.oldt = null;
        this.newt = null;
    }
}

class SelectionTransformOp {
    name = 'selectionTransform';

    splat: Splat;
    indices: Uint32Array;
    transform: Mat4;

    constructor(options: { splat: Splat, transform: Mat4 }) {
        const splatData = options.splat.splatData;
        const state = splatData.getProp('state') as Uint8Array;
        const indices = buildIndex(splatData, (i) => !!(state[i] & State.selected));

        this.splat = options.splat;
        this.indices = indices;
        this.transform = options.transform;
    }

    do() {

    }

    undo() {

    }

    destroy() {
        this.splat = null;
        this.transform = null;
    }
}

class SetPivotOp {
    name = "setPivot";
    splat: Splat;
    oldPivot: Vec3;
    newPivot: Vec3;

    constructor(splat: Splat, oldPivot: Vec3, newPivot: Vec3) {
        this.splat = splat;
        this.oldPivot = oldPivot;
        this.newPivot = newPivot;
    }

    do() {
        this.splat.setPivot(this.newPivot);
    }

    undo() {
        this.splat.setPivot(this.oldPivot);
    }
}

const v = new Vec3();

class SplatTranslateOp {
    name = 'splatTranslate';
    splat: Splat;
    indices: Uint32Array;
    positions: Float32Array;
    transform: Mat4;

    constructor(splat: Splat, transform: Mat4) {
        const splatData = splat.splatData;
        const state = splatData.getProp('state') as Uint8Array;
        const indices = buildIndex(splatData, (i) => !!(state[i] & State.selected));
        const positions = new Float32Array(indices.length * 3);

        const x = splatData.getProp('x') as Float32Array;
        const y = splatData.getProp('y') as Float32Array;
        const z = splatData.getProp('z') as Float32Array;

        for (let i = 0; i < indices.length; ++i) {
            positions[i * 3 + 0] = x[indices[i]];
            positions[i * 3 + 1] = y[indices[i]];
            positions[i * 3 + 2] = z[indices[i]];
        }

        this.splat = splat;
        this.indices = indices;
        this.positions = new Float32Array(indices.length * 3);
        this.transform = transform;
    }

    do() {
        const splatData = this.splat.splatData;
        const x = splatData.getProp('x') as Float32Array;
        const y = splatData.getProp('y') as Float32Array;
        const z = splatData.getProp('z') as Float32Array;

        for (let i = 0; i < this.indices.length; ++i) {
            v.set(this.positions[i * 3 + 0], this.positions[i * 3 + 1], this.positions[i * 3 + 2]);
            this.transform.transformPoint(v, v);
            const idx = this.indices[i];
            x[idx] = v.x;
            y[idx] = v.y;
            z[idx] = v.z;
        }

        this.splat.updateState(State.deleted);
    }

    undo() {
        const splatData = this.splat.splatData;
        const x = splatData.getProp('x') as Float32Array;
        const y = splatData.getProp('y') as Float32Array;
        const z = splatData.getProp('z') as Float32Array;

        for (let i = 0; i < this.indices.length; ++i) {
            const idx = this.indices[i];
            x[idx] = this.positions[i * 3 + 0];
            y[idx] = this.positions[i * 3 + 1];
            z[idx] = this.positions[i * 3 + 2];
        }

        this.splat.updateState(State.deleted);
    }

    destroy() {
        this.splat = null;
        this.indices = null;
        this.positions = null;
        this.transform = null;
    }
}

export {
    EditOp,
    DeleteSelectionEditOp,
    ResetEditOp,
    EntityTransformOp,
    SetPivotOp,
    SplatTranslateOp
};
