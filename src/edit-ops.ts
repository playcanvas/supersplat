import { Color, Mat4 } from 'playcanvas';

import { IndexRanges, sortedPredicate } from './index-ranges';
import { Pivot } from './pivot';
import { Scene } from './scene';
import { Splat } from './splat';
import { State } from './splat-state';
import { Transform } from './transform';

interface EditOp {
    name: string;
    do(): void | Promise<void>;
    undo(): void | Promise<void>;
    destroy?(): void;
}

const enum BitOp {
    SET,
    CLEAR,
    TOGGLE
}

class StateOp {
    splat: Splat;
    ranges: IndexRanges;
    mask: number;
    op: BitOp;
    updateFlags: number;

    constructor(splat: Splat, ranges: IndexRanges, mask: number, op: BitOp, updateFlags = State.selected) {
        this.splat = splat;
        this.ranges = ranges;
        this.mask = mask;
        this.op = op;
        this.updateFlags = updateFlags;
    }

    private apply(op: BitOp) {
        const state = this.splat.splatData.getProp('state') as Uint8Array;
        const { mask } = this;

        switch (op) {
            case BitOp.SET:
                this.ranges.forEach((i) => {
                    state[i] |= mask;
                });
                break;
            case BitOp.CLEAR:
                this.ranges.forEach((i) => {
                    state[i] &= ~mask;
                });
                break;
            case BitOp.TOGGLE:
                this.ranges.forEach((i) => {
                    state[i] ^= mask;
                });
                break;
        }
    }

    async do() {
        this.apply(this.op);
        await this.splat.updateState(this.updateFlags);
    }

    async undo() {
        const undoOp = this.op === BitOp.TOGGLE ? BitOp.TOGGLE :
            this.op === BitOp.SET ? BitOp.CLEAR : BitOp.SET;
        this.apply(undoOp);
        await this.splat.updateState(this.updateFlags);
    }

    destroy() {
        this.splat = null;
        this.ranges = null;
    }
}

class SelectAllOp extends StateOp {
    name = 'selectAll';

    constructor(splat: Splat) {
        const state = splat.splatData.getProp('state') as Uint8Array;
        super(splat, IndexRanges.fromPredicate(splat.splatData.numSplats, i => state[i] === 0), State.selected, BitOp.SET);
    }
}

class SelectNoneOp extends StateOp {
    name = 'selectNone';

    constructor(splat: Splat) {
        const state = splat.splatData.getProp('state') as Uint8Array;
        super(splat, IndexRanges.fromPredicate(splat.splatData.numSplats, i => state[i] === State.selected), State.selected, BitOp.CLEAR);
    }
}

class SelectInvertOp extends StateOp {
    name = 'selectInvert';

    constructor(splat: Splat) {
        const state = splat.splatData.getProp('state') as Uint8Array;
        super(splat, IndexRanges.fromPredicate(splat.splatData.numSplats, i => (state[i] & (State.locked | State.deleted)) === 0), State.selected, BitOp.TOGGLE);
    }
}

class SelectOp extends StateOp {
    name = 'selectOp';

    constructor(splat: Splat, op: 'add' | 'remove' | 'set', filter: ((i: number) => boolean) | Uint32Array) {
        const splatData = splat.splatData;
        const state = splatData.getProp('state') as Uint8Array;
        const bitOp = op === 'add' ? BitOp.SET : op === 'remove' ? BitOp.CLEAR : BitOp.TOGGLE;

        // wrap sorted IDs in a cursor-based predicate
        const pred = filter instanceof Uint32Array ? sortedPredicate(filter) : filter;

        const preds = {
            add: (i: number) => pred(i) && state[i] === 0,
            remove: (i: number) => pred(i) && state[i] === State.selected,
            set: (i: number) => (state[i] === State.selected) !== pred(i)
        };

        super(splat, IndexRanges.fromPredicate(splatData.numSplats, preds[op]), State.selected, bitOp);
    }
}

class HideSelectionOp extends StateOp {
    name = 'hideSelection';

    constructor(splat: Splat) {
        const state = splat.splatData.getProp('state') as Uint8Array;
        super(splat, IndexRanges.fromPredicate(splat.splatData.numSplats, i => state[i] === State.selected), State.locked, BitOp.SET, State.locked);
    }
}

class UnhideAllOp extends StateOp {
    name = 'unhideAll';

    constructor(splat: Splat) {
        const state = splat.splatData.getProp('state') as Uint8Array;
        super(splat, IndexRanges.fromPredicate(splat.splatData.numSplats, i => (state[i] & (State.locked | State.deleted)) === State.locked), State.locked, BitOp.CLEAR, State.locked);
    }
}

class DeleteSelectionOp extends StateOp {
    name = 'deleteSelection';

    constructor(splat: Splat) {
        const state = splat.splatData.getProp('state') as Uint8Array;
        super(splat, IndexRanges.fromPredicate(splat.splatData.numSplats, i => state[i] === State.selected), State.deleted, BitOp.SET, State.deleted);
    }
}

class ResetOp extends StateOp {
    name = 'reset';

    constructor(splat: Splat) {
        const state = splat.splatData.getProp('state') as Uint8Array;
        super(splat, IndexRanges.fromPredicate(splat.splatData.numSplats, i => (state[i] & State.deleted) !== 0), State.deleted, BitOp.CLEAR, State.deleted);
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

    async do() {
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

        await splat.updatePositions();
    }

    async undo() {
        const { splat, paletteMap } = this;
        const state = splat.splatData.getProp('state') as Uint8Array;
        const indices = splat.transformTexture.lock() as Uint16Array;

        // invert the palette map
        const inverseMap = new Map<number, number>();
        paletteMap.forEach((newIdx, oldIdx) => {
            inverseMap.set(newIdx, oldIdx);
        });

        // restore the original transform indices
        for (let i = 0; i < state.length; ++i) {
            if (state[i] === State.selected) {
                indices[i] = inverseMap.get(indices[i]);
            }
        }

        splat.transformTexture.unlock();

        splat.transformPalette.free(paletteMap.size);

        await splat.updatePositions();
    }

    destroy() {
        this.splat = null;
        this.transform = null;
        this.paletteMap = null;
    }
}

class PlacePivotOp {
    name = 'setPivot';
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

type ColorAdjustment = {
    tintClr?: Color
    temperature?: number,
    saturation?: number,
    brightness?: number,
    blackPoint?: number,
    whitePoint?: number,
    transparency?: number
};

class SetSplatColorAdjustmentOp {
    name: 'setSplatColor';
    splat: Splat;

    newState: ColorAdjustment;
    oldState: ColorAdjustment;

    constructor(options: { splat: Splat, oldState: ColorAdjustment, newState: ColorAdjustment }) {
        const { splat, oldState, newState } = options;
        this.splat = splat;
        this.oldState = oldState;
        this.newState = newState;
    }

    do() {
        const { splat } = this;
        const { tintClr, temperature, saturation, brightness, blackPoint, whitePoint, transparency } = this.newState;
        if (tintClr) splat.tintClr = tintClr;
        if (temperature !== null) splat.temperature = temperature;
        if (saturation !== null) splat.saturation = saturation;
        if (brightness !== null) splat.brightness = brightness;
        if (blackPoint !== null) splat.blackPoint = blackPoint;
        if (whitePoint !== null) splat.whitePoint = whitePoint;
        if (transparency !== null) splat.transparency = transparency;
    }

    undo() {
        const { splat } = this;
        const { tintClr, temperature, saturation, brightness, blackPoint, whitePoint, transparency } = this.oldState;
        if (tintClr) splat.tintClr = tintClr;
        if (temperature !== null) splat.temperature = temperature;
        if (saturation !== null) splat.saturation = saturation;
        if (brightness !== null) splat.brightness = brightness;
        if (blackPoint !== null) splat.blackPoint = blackPoint;
        if (whitePoint !== null) splat.whitePoint = whitePoint;
        if (transparency !== null) splat.transparency = transparency;
    }
}

class MultiOp {
    name = 'multiOp';
    ops: EditOp[];

    constructor(ops: EditOp[]) {
        this.ops = ops;
    }

    async do() {
        for (const op of this.ops) {
            await op.do();
        }
    }

    async undo() {
        for (const op of this.ops) {
            await op.undo();
        }
    }
}

class AddSplatOp {
    name: 'addSplat';
    scene: Scene;
    splat: Splat;

    constructor(scene: Scene, splat: Splat) {
        this.scene = scene;
        this.splat = splat;
    }

    async do() {
        await this.scene.add(this.splat);
    }

    undo() {
        this.scene.remove(this.splat);
    }

    destroy() {
        this.splat.destroy();
    }
}

class SplatRenameOp {
    name = 'splatRename';
    splat: Splat;
    oldName: string;
    newName: string;

    constructor(splat: Splat, newName: string) {
        this.splat = splat;
        this.oldName = splat.name;
        this.newName = newName;
    }

    do() {
        this.splat.name = this.newName;
    }

    undo() {
        this.splat.name = this.oldName;
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
    ColorAdjustment,
    SetSplatColorAdjustmentOp,
    MultiOp,
    AddSplatOp,
    SplatRenameOp
};
