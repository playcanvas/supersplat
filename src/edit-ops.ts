import { Mat4, Vec3 } from 'playcanvas';
import { Splat } from './splat';
import { State } from './splat-state';
import { Transform } from './transform';
import { Pivot } from './pivot';

interface EditOp {
    name: string;
    do(): void;
    undo(): void;
    destroy?(): void;
}

/**
 * Build two index lists based on a boolean predicate over indices.
 * The first list contains single indices.
 * The second list contains groups of two, defining a range of indices with exclusive end.
 * Both lists are stored in the same result array, adding values from the single indices at
 * the front and index-ranges at the end.
 */
const buildIndex = (total: number, pred: (i: number) => boolean) => {
    let num = 0;
    for (let i = 0; i < total; ++i) {
        if (pred(i)) num++;
    }

    // For efficient packing, single indices are placed at the beginning of this Uint32Array,
    // Ranges are placed to the end.
    const result = new Uint32Array(num);

    let singleIdx = 0;
    let rangeIdx = num - 1;
    let rangeStart = -1;

    for (let i = 0; i <= total; i++) {
        if (pred(i) && i < total){
            if(rangeStart === -1){
                rangeStart = i;
            }
        }
        else{
            if(rangeStart !== -1){
                if(i - rangeStart < 2){
                    result[singleIdx++] = i - 1; // current i had already pred(i) === false
                }
                else{
                    result[rangeIdx--] = i ; // range end is exclusive
                    result[rangeIdx--] = rangeStart;
                }       
                rangeStart = -1;
            }
        }            
    }

    return [result.slice(0, singleIdx), result.slice(rangeIdx + 1)];
};

type filterFunc = (state: number, index: number) => boolean;
type doFunc = (state: number) => number;
type undoFunc = (state: number) => number;

class StateOp {
    splat: Splat;
    singleIndices: Uint32Array;
    rangeIndices: Uint32Array;
    doIt: doFunc;
    undoIt: undoFunc;
    updateFlags: number;

    constructor(splat: Splat, filter: filterFunc, doIt: doFunc, undoIt: undoFunc, updateFlags = State.selected) {
        const splatData = splat.splatData;
        const state = splatData.getProp('state') as Uint8Array;
        
        const [singleIndices, rangeIndices] = buildIndex(splatData.numSplats, (i) => filter(state[i], i));
        
        this.singleIndices = singleIndices;
        this.rangeIndices = rangeIndices;

        this.splat = splat;
        this.doIt = doIt;
        this.undoIt = undoIt;
        this.updateFlags = updateFlags;
    }

    forEachIndex(operation: (idx: number) => void) {
        for (let i = 0; i < this.singleIndices.length; ++i) {
            const idx = this.singleIndices[i];
            operation(idx);
        }

        for(let rIdx = 0; rIdx < this.rangeIndices.length; rIdx += 2){
            for(let idx = this.rangeIndices[rIdx], endIdx = this.rangeIndices[rIdx + 1];  idx < endIdx; idx++){
                operation(idx);
            }
        }
    }

    do() {
        const splatData = this.splat.splatData;
        const state = splatData.getProp('state') as Uint8Array;

        this.forEachIndex((idx) => {state[idx] = this.doIt(state[idx])});
        this.splat.updateState(this.updateFlags);
    }

    undo() {
        const splatData = this.splat.splatData;
        const state = splatData.getProp('state') as Uint8Array;

        this.forEachIndex((idx) => {state[idx] = this.undoIt(state[idx])});
        this.splat.updateState(this.updateFlags);
    }

    destroy() {
        this.splat = null;
        this.singleIndices = null;
        this.rangeIndices = null;
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

// op for modifying a splat transform
class EntityTransformOp {
    name = 'entityTransform';
    splat: Splat;
    oldt: Transform;
    newt: Transform;

    constructor(options: { splat: Splat, oldt: Transform, newt: Transform }) {
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

const mat = new Mat4();

// op for modifying a subset of individual splats
class SplatsTransformOp {
    name = 'splatsTransform';

    splat: Splat;
    transform: Mat4;
    paletteMap: Map<number, number>;

    constructor(options: { splat: Splat, transform: Mat4, paletteMap: Map<number, number> }) {
        this.splat = options.splat;
        this.transform = options.transform;
        this.paletteMap = options.paletteMap;
    }

    do() {
        const { splat, transform, paletteMap } = this;
        const state = splat.splatData.getProp('state') as Uint8Array;
        const indices = splat.transformTexture.lock() as Uint16Array;

        // update splat transform palette indices
        for (let i = 0; i < state.length; ++i) {
            if (state[i] === State.selected) {
                indices[i] = paletteMap.get(indices[i]);
            }
        }

        splat.transformTexture.unlock();

        splat.transformPalette.alloc(paletteMap.size);

        // update transform palette
        const { transformPalette } = splat;
        this.paletteMap.forEach((newIdx, oldIdx) => {
            transformPalette.getTransform(oldIdx, mat);
            mat.mul2(transform, mat);
            transformPalette.setTransform(newIdx, mat);
        });

        splat.makeSelectionBoundDirty();
        splat.updatePositions();
    }

    undo() {
        const { splat, paletteMap } = this;
        const state = splat.splatData.getProp('state') as Uint8Array;
        const indices = splat.transformTexture.lock() as Uint16Array;

        // invert the palette map
        const inverseMap = new Map<number, number>();
        paletteMap.forEach((newIdx, oldIdx) => {
            inverseMap.set(newIdx, oldIdx);
        });

        splat.transformTexture.unlock();

        // restore the original transform indices
        for (let i = 0; i < state.length; ++i) {
            if (state[i] === State.selected) {
                indices[i] = inverseMap.get(indices[i]);
            }
        }

        splat.transformPalette.free(paletteMap.size);

        splat.makeSelectionBoundDirty();
        splat.updatePositions();
    }

    destroy() {
        this.splat = null;
        this.transform = null;
        this.paletteMap = null;
    }
}

class PlacePivotOp {
    name = "setPivot";
    pivot: Pivot;
    oldt: Transform;
    newt: Transform;

    constructor(options: { pivot: Pivot, oldt: Transform, newt: Transform }) {
        this.pivot = options.pivot;
        this.oldt = options.oldt;
        this.newt = options.newt;
    }

    do() {
        this.pivot.place(this.newt);
    }

    undo() {
        this.pivot.place(this.oldt);
    }
}

class MultiOp {
    name = "multiOp";
    ops: EditOp[];

    constructor(ops: EditOp[]) {
        this.ops = ops;
    }

    do() {
        this.ops.forEach(op => op.do());
    }

    undo() {
        this.ops.forEach(op => op.undo());
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
    SplatsTransformOp,
    PlacePivotOp,
    MultiOp
};
