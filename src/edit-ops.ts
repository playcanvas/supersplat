import { Entity, GSplatData, Quat, Vec3 } from 'playcanvas';
import { Scene } from './scene';

enum State {
    selected = 1,
    hidden = 2,
    deleted = 4
};

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
    splatData: GSplatData;
    indices: Uint32Array;

    constructor(splatData: GSplatData) {
        const state = splatData.getProp('state') as Uint8Array;
        const indices = buildIndex(splatData, (i) => !!(state[i] & State.selected));

        this.splatData = splatData;
        this.indices = indices;
    }

    do() {
        const state = this.splatData.getProp('state') as Uint8Array;
        for (let i = 0; i < this.indices.length; ++i) {
            state[this.indices[i]] |= State.deleted;
        }
    }

    undo() {
        const state = this.splatData.getProp('state') as Uint8Array;
        for (let i = 0; i < this.indices.length; ++i) {
            state[this.indices[i]] &= ~State.deleted;
        }
    }

    destroy() {
        this.splatData = null;
        this.indices = null;
    }
}

class ResetEditOp {
    name = 'reset';
    splatData: GSplatData;
    indices: Uint32Array;

    constructor(splatData: GSplatData) {
        const state = splatData.getProp('state') as Uint8Array;
        const indices = buildIndex(splatData, (i) => !!(state[i] & State.deleted));

        this.splatData = splatData;
        this.indices = indices;
    }

    do() {
        const state = this.splatData.getProp('state') as Uint8Array;
        for (let i = 0; i < this.indices.length; ++i) {
            state[this.indices[i]] &= ~State.deleted;
        }
    }

    undo() {
        const state = this.splatData.getProp('state') as Uint8Array;
        for (let i = 0; i < this.indices.length; ++i) {
            state[this.indices[i]] |= State.deleted;
        }
    }

    destroy() {
        this.splatData = null;
        this.indices = null;
    }
}

interface EntityTransform {
    position: Vec3;
    rotation: Quat;
    scale: Vec3;
};

interface EntityOp {
    entity: Entity;
    old: EntityTransform;
    new: EntityTransform;
}

class EntityTransformOp {
    name = 'entityTransform';
    scene: Scene;
    entityOps: EntityOp[];

    constructor(scene: Scene, entityOps: EntityOp[]) {
        this.scene = scene;
        this.entityOps = entityOps;
    }

    do() {
        this.entityOps.forEach((entityOp) => {
            entityOp.entity.setLocalPosition(entityOp.new.position);
            entityOp.entity.setLocalRotation(entityOp.new.rotation);
            entityOp.entity.setLocalScale(entityOp.new.scale);
        });
        this.scene.updateBound();
    }

    undo() {
        this.entityOps.forEach((entityOp) => {
            entityOp.entity.setLocalPosition(entityOp.old.position);
            entityOp.entity.setLocalRotation(entityOp.old.rotation);
            entityOp.entity.setLocalScale(entityOp.old.scale);
        });
        this.scene.updateBound();
    }

    destroy() {
        this.entityOps = [];
    }
};

export {
    State,
    DeleteSelectionEditOp,
    ResetEditOp,
    EntityTransformOp
};
