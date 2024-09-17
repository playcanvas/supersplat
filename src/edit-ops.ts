import { GSplatData, Quat, Vec3 } from 'playcanvas';
import { Scene } from './scene';
import { Splat } from './splat';

enum State {
    selected = 1,
    hidden = 2,
    deleted = 4
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
        this.splat.updateState(true);
    }

    undo() {
        const splatData = this.splat.splatData;
        const state = splatData.getProp('state') as Uint8Array;
        for (let i = 0; i < this.indices.length; ++i) {
            state[this.indices[i]] &= ~State.deleted;
        }
        this.splat.updateState(true);
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
        this.splat.updateState(true);
    }

    undo() {
        const splatData = this.splat.splatData;
        const state = splatData.getProp('state') as Uint8Array;
        for (let i = 0; i < this.indices.length; ++i) {
            state[this.indices[i]] |= State.deleted;
        }
        this.splat.updateState(true);
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

interface EntityOp {
    splat: Splat;
    old: EntityTransform;
    new: EntityTransform;
}

class EntityTransformOp {
    name = 'entityTransform';
    entityOps: EntityOp[];

    constructor(entityOps: EntityOp[]) {
        this.entityOps = entityOps;
    }

    do() {
        this.entityOps.forEach((entityOp) => {
            entityOp.splat.move(entityOp.new.position, entityOp.new.rotation, entityOp.new.scale);
        });
    }

    undo() {
        this.entityOps.forEach((entityOp) => {
            entityOp.splat.move(entityOp.old.position, entityOp.old.rotation, entityOp.old.scale);
        });
    }

    destroy() {
        this.entityOps = [];
    }
}

export {
    State,
    DeleteSelectionEditOp,
    ResetEditOp,
    EntityOp,
    EntityTransformOp
};
