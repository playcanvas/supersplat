import { Mat4, Quat, Vec3 } from 'playcanvas';
import { Splat } from './splat';
import { State } from './splat-state';

interface EditOp {
    name: string;
    do(): void;
    undo(): void;
    destroy?(): void;
}

// build an index array based on a boolean predicate over indices
const buildIndex = (total: number, pred: (i: number) => boolean) => {
    let num = 0;
    for (let i = 0; i < total; ++i) {
        if (pred(i)) num++;
    }

    const result = new Uint32Array(num);
    let idx = 0;
    for (let i = 0; i < total; ++i) {
        if (pred(i)) {
            result[idx++] = i;
        }
    }

    return result;
};

type filterFunc = (state: number, index: number) => boolean;
type doFunc = (state: number) => number;
type undoFunc = (state: number) => number;

class StateOp {
    splat: Splat;
    indices: Uint32Array;
    doIt: doFunc;
    undoIt: undoFunc;
    updateFlags: number;

    constructor(splat: Splat, filter: filterFunc, doIt: doFunc, undoIt: undoFunc, updateFlags = State.selected) {
        const splatData = splat.splatData;
        const state = splatData.getProp('state') as Uint8Array;
        const indices = buildIndex(splatData.numSplats, (i) => filter(state[i], i));

        this.splat = splat;
        this.indices = indices;
        this.doIt = doIt;
        this.undoIt = undoIt;
        this.updateFlags = updateFlags;
    }

    do() {
        const splatData = this.splat.splatData;
        const state = splatData.getProp('state') as Uint8Array;
        for (let i = 0; i < this.indices.length; ++i) {
            const idx = this.indices[i];
            state[idx] = this.doIt(state[idx]);
        }
        this.splat.updateState(this.updateFlags);
    }

    undo() {
        const splatData = this.splat.splatData;
        const state = splatData.getProp('state') as Uint8Array;
        for (let i = 0; i < this.indices.length; ++i) {
            const idx = this.indices[i];
            state[idx] = this.undoIt(state[idx]);
        }
        this.splat.updateState(this.updateFlags);
    }

    destroy() {
        this.splat = null;
        this.indices = null;
    }
}

class SelectAllOp extends StateOp {
    name = 'selectAll';

    constructor(splat: Splat) {
        super(splat,
            (state) => state === 0,
            (state) => state | State.selected,
            (state) => state & (~State.selected)
        );
    }
}

class SelectNoneOp extends StateOp {
    name = 'selectNone';

    constructor(splat: Splat) {
        super(splat,
            (state) => state === State.selected,
            (state) => state & (~State.selected),
            (state) => state | State.selected
        );
    }
}

class SelectInvertOp extends StateOp {
    name = 'selectInvert';

    constructor(splat: Splat) {
        super(splat,
            (state) => (state & (State.hidden | State.deleted)) === 0,
            (state) => state ^ State.selected,
            (state) => state ^ State.selected
        );
    }
}

class SelectOp extends StateOp {
    name = 'selectOp';

    constructor(splat: Splat, op: 'add'|'remove'|'set', filter: (i: number) => boolean) {
        const filterFunc = {
            add: (state: number, index: number) => (state === 0) && filter(index),
            remove: (state: number, index: number) => (state === State.selected) && filter(index),
            set: (state: number, index: number) => (state === State.selected) !== filter(index),
        };

        const doIt = {
            add: (state: number) => state | State.selected,
            remove: (state: number) => state & (~State.selected),
            set: (state: number) => state ^ State.selected
        };

        const undoIt = {
            add: (state: number) => state & (~State.selected),
            remove: (state: number) => state | State.selected,
            set: (state: number) => state ^ State.selected
        };

        super(splat, filterFunc[op], doIt[op], undoIt[op]);
    }
}

class HideSelectionOp extends StateOp {
    name = 'hideSelection';

    constructor(splat: Splat) {
        super(splat,
            (state) => state === State.selected,
            (state) => state | State.hidden,
            (state) => state & (~State.hidden),
            State.hidden
        );
    }
}

class UnhideAllOp extends StateOp {
    name = 'unhideAll';

    constructor(splat: Splat) {
        super(splat,
            (state) => (state & (State.hidden | State.deleted)) === State.hidden,
            (state) => state & (~State.hidden),
            (state) => state | State.hidden,
            State.hidden
        );
    }
}

class DeleteSelectionOp extends StateOp {
    name = 'deleteSelection';

    constructor(splat: Splat) {
        super(splat,
            (state) => state === State.selected,
            (state) => state | State.deleted,
            (state) => state & (~State.deleted),
            State.deleted
        );
    }
}

class ResetOp extends StateOp {
    name = 'reset';

    constructor(splat: Splat) {
        super(splat,
            (state) => (state & State.deleted) !== 0,
            (state) => state & (~State.deleted),
            (state) => state | State.deleted,
            State.deleted
        );
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
        const indices = buildIndex(splatData.numSplats, (i) => !!(state[i] & State.selected));

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
        const indices = buildIndex(splatData.numSplats, (i) => !!(state[i] & State.selected));
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
    SelectAllOp,
    SelectNoneOp,
    SelectInvertOp,
    SelectOp,
    HideSelectionOp,
    UnhideAllOp,
    DeleteSelectionOp,
    ResetOp,
    EntityTransformOp,
    SetPivotOp,
    SplatTranslateOp
};
