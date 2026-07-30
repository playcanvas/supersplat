import { Color, Mat4, Quat, Vec3 } from 'playcanvas';

import { AnimTrack } from './anim-track';
import { BoxShape } from './box-shape';
import type { RemovedInstances } from './gaussian-instances';
import { IndexRanges, sortedPredicate } from './index-ranges';
import { Pivot } from './pivot';
import { Scene } from './scene';
import { SphereShape } from './sphere-shape';
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

    constructor(splat: Splat, ranges: IndexRanges, mask: number, op: BitOp) {
        this.splat = splat;
        this.ranges = ranges;
        this.mask = mask;
        this.op = op;
    }

    private apply(op: BitOp) {
        const { instances } = this.splat;
        const { mask, ranges } = this;

        switch (op) {
            case BitOp.SET:
                instances.setBits(ranges, mask);
                break;
            case BitOp.CLEAR:
                instances.clearBits(ranges, mask);
                break;
            case BitOp.TOGGLE:
                instances.toggleBits(ranges, mask);
                break;
        }
    }

    async do() {
        this.apply(this.op);
        await this.splat.updateState();
    }

    async undo() {
        const undoOp = this.op === BitOp.TOGGLE ? BitOp.TOGGLE :
            this.op === BitOp.SET ? BitOp.CLEAR : BitOp.SET;
        this.apply(undoOp);
        await this.splat.updateState();
    }

    destroy() {
        this.splat = null;
        this.ranges = null;
    }
}

class SelectAllOp extends StateOp {
    name = 'selectAll';

    constructor(splat: Splat) {
        const state = splat.instances.flags;
        const count = splat.instances.count;
        super(splat, IndexRanges.fromPredicate(count, i => state[i] === 0), State.selected, BitOp.SET);
    }
}

class SelectNoneOp extends StateOp {
    name = 'selectNone';

    constructor(splat: Splat) {
        const state = splat.instances.flags;
        const count = splat.instances.count;
        super(splat, IndexRanges.fromPredicate(count, i => state[i] === State.selected), State.selected, BitOp.CLEAR);
    }
}

class SelectInvertOp extends StateOp {
    name = 'selectInvert';

    constructor(splat: Splat) {
        const state = splat.instances.flags;
        const count = splat.instances.count;
        super(splat, IndexRanges.fromPredicate(count, i => (state[i] & State.locked) === 0), State.selected, BitOp.TOGGLE);
    }
}

class SelectOp extends StateOp {
    name = 'selectOp';

    // `sel` is a committed snapshot of hits: either a per-splat mask
    // (Uint8Array, 255 = hit) or a sorted Uint32Array of indices. taking a
    // committed mask rather than a closure removes the foot-gun where a
    // predicate captured `state[i]` at call time and was evaluated later.
    // `op` semantics:
    //   add       — select valid splats that are hit and currently unselected
    //   remove    — deselect valid splats that are hit and currently selected
    //   set       — make selection match the hit mask (toggle valid splats whose
    //               current selection state differs from the mask). NOT a replace —
    //               the underlying BitOp is TOGGLE on the rows where selection and
    //               hit disagree, which leaves the locked bit untouched.
    //   intersect — keep only splats currently selected AND in the hit mask
    //               (clear the selected bit on selected splats that are not hit).
    constructor(splat: Splat, op: 'add' | 'remove' | 'set' | 'intersect', sel: Uint8Array | Uint32Array) {
        const state = splat.instances.flags;
        const count = splat.instances.count;
        const isHit = sel instanceof Uint32Array ? sortedPredicate(sel) : (i: number) => sel[i] === 255;

        // single rule applied uniformly: only valid (clean or selected) splats
        // are considered. consolidates the locked guard in one place so
        // each producer doesn't have to remember it for the 'set' (toggle) path.
        const valid = (i: number) => state[i] === 0 || state[i] === State.selected;

        // op → bit operation and op → predicate, kept as parallel lookups keyed
        // by the same union so adding an op forces both to be updated together.
        const bitOps = {
            add: BitOp.SET,
            remove: BitOp.CLEAR,
            set: BitOp.TOGGLE,
            intersect: BitOp.CLEAR
        };

        const preds = {
            add: (i: number) => valid(i) && isHit(i) && state[i] === 0,
            remove: (i: number) => valid(i) && isHit(i) && state[i] === State.selected,
            set: (i: number) => valid(i) && ((state[i] === State.selected) !== isHit(i)),
            intersect: (i: number) => valid(i) && state[i] === State.selected && !isHit(i)
        };

        super(splat, IndexRanges.fromPredicate(count, preds[op]), State.selected, bitOps[op]);
    }
}

class HideSelectionOp extends StateOp {
    name = 'hideSelection';

    constructor(splat: Splat) {
        const state = splat.instances.flags;
        const count = splat.instances.count;
        super(splat, IndexRanges.fromPredicate(count, i => state[i] === State.selected), State.locked, BitOp.SET);
    }
}

class UnhideAllOp extends StateOp {
    name = 'unhideAll';

    constructor(splat: Splat) {
        const state = splat.instances.flags;
        const count = splat.instances.count;
        super(splat, IndexRanges.fromPredicate(count, i => (state[i] & State.locked) !== 0), State.locked, BitOp.CLEAR);
    }
}

// Deleting removes the selected instances from the live list, order-preserving,
// and retains their records so undo can put them back exactly where they were.
// The recorded ranges stay meaningful for older ops because the edit history is
// strict LIFO: nothing older is undone until this op has been.
class RemoveInstancesOp {
    name = 'removeInstances';
    splat: Splat;
    ranges: IndexRanges;
    private removed: RemovedInstances = null;

    constructor(splat: Splat) {
        const state = splat.instances.flags;
        this.splat = splat;
        this.ranges = IndexRanges.fromPredicate(splat.instances.count, i => state[i] === State.selected);
    }

    async do() {
        this.removed = this.splat.instances.remove(this.ranges);
        await this.splat.updateState();
    }

    async undo() {
        this.splat.instances.insert(this.removed);
        this.removed = null;
        await this.splat.updateState();
    }

    destroy() {
        this.splat = null;
        this.ranges = null;
        this.removed = null;
    }
}

// Bring back every static gaussian nothing references any more. Unlike undo the
// original positions are gone, so the restored instances land at the tail, clean.
class RestoreMissingInstancesOp {
    name = 'restoreMissingInstances';
    splat: Splat;
    private appended = 0;

    constructor(splat: Splat) {
        this.splat = splat;
    }

    async do() {
        this.appended = this.splat.instances.appendMissing(this.splat.resource.numRows);
        await this.splat.updateState();
    }

    async undo() {
        this.splat.instances.truncate(this.appended);
        this.appended = 0;
        await this.splat.updateState();
    }

    destroy() {
        this.splat = null;
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
        const { instances } = splat;
        const state = instances.flags;

        // update the selected instances' transform palette indices
        for (let i = 0; i < instances.count; ++i) {
            if (state[i] === State.selected) {
                instances.setTransformIndex(i, paletteMap.get(instances.transformIndex(i)));
            }
        }

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
        const { instances } = splat;
        const state = instances.flags;

        // invert the palette map
        const inverseMap = new Map<number, number>();
        paletteMap.forEach((newIdx, oldIdx) => {
            inverseMap.set(newIdx, oldIdx);
        });

        // restore the original transform indices
        for (let i = 0; i < instances.count; ++i) {
            if (state[i] === State.selected) {
                instances.setTransformIndex(i, inverseMap.get(instances.transformIndex(i)));
            }
        }

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

// op for setting a splat's user-defined local frame (the origin and rotation
// the transform gizmos and panel use in local coordinate space)
class SetLocalFrameOp {
    name = 'setLocalFrame';
    splat: Splat;
    oldOrigin: Vec3;
    oldFrame: Quat;
    newOrigin: Vec3;
    newFrame: Quat;

    constructor(options: { splat: Splat, oldOrigin: Vec3, oldFrame: Quat, newOrigin: Vec3, newFrame: Quat }) {
        this.splat = options.splat;
        this.oldOrigin = options.oldOrigin;
        this.oldFrame = options.oldFrame;
        this.newOrigin = options.newOrigin;
        this.newFrame = options.newFrame;
    }

    do() {
        this.splat.setLocalFrame(this.newOrigin, this.newFrame);
    }

    undo() {
        this.splat.setLocalFrame(this.oldOrigin, this.oldFrame);
    }

    destroy() {
        this.splat = null;
        this.oldOrigin = null;
        this.oldFrame = null;
        this.newOrigin = null;
        this.newFrame = null;
    }
}

type ShapeTransformState = {
    position: Vec3;
    rotation?: Quat;
    lens?: Vec3;        // box lengths
    radius?: number;    // sphere radius
};

// moves/rotates/resizes a box/sphere selection volume
class ShapeTransformOp {
    name = 'shapeTransform';
    shape: BoxShape | SphereShape;
    oldState: ShapeTransformState;
    newState: ShapeTransformState;

    constructor(options: { shape: BoxShape | SphereShape, oldState: ShapeTransformState, newState: ShapeTransformState }) {
        this.shape = options.shape;
        this.oldState = options.oldState;
        this.newState = options.newState;
    }

    apply(state: ShapeTransformState) {
        const { shape } = this;
        shape.pivot.setPosition(state.position);
        if (state.rotation) {
            shape.pivot.setRotation(state.rotation);
        }
        if (shape instanceof BoxShape && state.lens) {
            // the length setters refresh the bound with the new transform
            shape.lenX = state.lens.x;
            shape.lenY = state.lens.y;
            shape.lenZ = state.lens.z;
        } else if (shape instanceof SphereShape && state.radius !== undefined) {
            // the radius setter refreshes the bound with the new transform
            shape.radius = state.radius;
        } else {
            shape.moved();
        }

        // refresh the owning tool's ui. shape ops are purged from history when
        // the tool deactivates, so the shape is normally in the scene here; the
        // guard covers the brief window where an already-queued undo/redo runs
        // after a synchronous deactivate.
        shape.scene?.events.fire('shapeSelection.changed', shape);
    }

    do() {
        this.apply(this.newState);
    }

    undo() {
        this.apply(this.oldState);
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
    name = 'setSplatColor';
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

// Snapshot-based undo/redo for animation track edits.
// Captures the full track state before and after a mutation.
class AnimTrackEditOp {
    name: string;
    track: AnimTrack;
    before: unknown;
    after: unknown;

    constructor(name: string, track: AnimTrack, before: unknown, after: unknown) {
        this.name = name;
        this.track = track;
        this.before = before;
        this.after = after;
    }

    do() {
        this.track.restore(this.after);
    }

    undo() {
        this.track.restore(this.before);
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
    name = 'addSplat';
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
    RemoveInstancesOp,
    RestoreMissingInstancesOp,
    EntityTransformOp,
    SplatsTransformOp,
    PlacePivotOp,
    SetLocalFrameOp,
    ShapeTransformOp,
    ShapeTransformState,
    ColorAdjustment,
    SetSplatColorAdjustmentOp,
    AnimTrackEditOp,
    MultiOp,
    AddSplatOp,
    SplatRenameOp
};
