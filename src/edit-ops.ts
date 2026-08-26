import { Color, Mat4, Quat, Vec3 } from 'playcanvas';

import { AnimTrack } from './anim-track';
import { BoxShape } from './box-shape';
import { composeGrades, createGradeTerms, type GradeTerms } from './color-grade';
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
// The instances that selection-driven operations act on. Note the strict
// equality: an instance that is both selected *and* locked is excluded, which is
// what makes locked gaussians survive a delete. Shared so that duplicate and
// separate copy exactly the set that separate then removes - deriving it twice
// would let the two drift apart and silently duplicate or drop instances.
const selectedRanges = (splat: Splat) => {
    const flags = splat.instances.flags;
    return IndexRanges.fromPredicate(splat.instances.count, i => flags[i] === State.selected);
};

class RemoveInstancesOp {
    name = 'removeInstances';
    splat: Splat;
    ranges: IndexRanges;
    private removed: RemovedInstances = null;

    constructor(splat: Splat) {
        this.splat = splat;
        this.ranges = selectedRanges(splat);
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

const gradeA = createGradeTerms();
const gradeB = createGradeTerms();
const identityGrade = createGradeTerms();

// op for grading a subset of individual splats. Mirrors SplatsTransformOp: one new
// palette entry per distinct pre-edit index, so gaussians that already shared a
// grade go on sharing one, and undo is a LIFO free plus an index restore.
// A null `grade` resets the targets to the identity grade instead of composing.
class SplatsColorOp {
    name = 'splatsColor';

    splat: Splat;
    grade: GradeTerms;

    // distinct pre-edit colour indices among the targets. The new indices aren't
    // stored: the palette allocator is LIFO, so a redo's alloc hands back exactly
    // the block undo freed.
    private oldIndices: number[];
    private paletteMap: Map<number, number>;

    constructor(options: { splat: Splat, grade: GradeTerms | null }) {
        this.splat = options.splat;
        this.grade = options.grade;

        const seen = new Set<number>();
        this.forEachTarget(i => seen.add(options.splat.instances.colorIndex(i)));
        this.oldIndices = [...seen];
    }

    // The colour panel targets the selection, and an empty selection means the
    // whole layer. Locked gaussians are never a target, which matches
    // selectedRanges(). Re-derived rather than captured because the edit history
    // is strict LIFO: any later selection change has already been undone by the
    // time this op's undo runs, so the target set is the same both ways.
    private forEachTarget(fn: (i: number) => void) {
        const { instances } = this.splat;
        const { flags } = instances;
        const all = instances.numSelected === 0;
        for (let i = 0; i < instances.count; ++i) {
            const f = flags[i];
            if ((f & State.locked) === 0 && (all || (f & State.selected) !== 0)) {
                fn(i);
            }
        }
    }

    do() {
        const { splat, grade, oldIndices } = this;
        const { instances, colorPalette } = splat;

        const base = colorPalette.alloc(oldIndices.length);
        const paletteMap = new Map<number, number>();
        oldIndices.forEach((oldIdx, i) => paletteMap.set(oldIdx, base + i));
        this.paletteMap = paletteMap;

        this.forEachTarget((i) => {
            instances.setColorIndex(i, paletteMap.get(instances.colorIndex(i)));
        });

        paletteMap.forEach((newIdx, oldIdx) => {
            if (grade) {
                colorPalette.getEntry(oldIdx, gradeA);
                colorPalette.setEntry(newIdx, composeGrades(gradeA, grade, gradeB));
            } else {
                colorPalette.setEntry(newIdx, identityGrade);
            }
        });

        splat.updateColors();
    }

    undo() {
        const { splat, paletteMap } = this;
        const { instances, colorPalette } = splat;

        // invert the palette map
        const inverseMap = new Map<number, number>();
        paletteMap.forEach((newIdx, oldIdx) => {
            inverseMap.set(newIdx, oldIdx);
        });

        this.forEachTarget((i) => {
            instances.setColorIndex(i, inverseMap.get(instances.colorIndex(i)));
        });

        colorPalette.free(paletteMap.size);

        splat.updateColors();
    }

    destroy() {
        this.splat = null;
        this.grade = null;
        this.oldIndices = null;
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
    selectedRanges,
    SelectAllOp,
    SelectNoneOp,
    SelectInvertOp,
    SelectOp,
    HideSelectionOp,
    UnhideAllOp,
    RemoveInstancesOp,
    RestoreMissingInstancesOp,
    EntityTransformOp,
    SplatsColorOp,
    SplatsTransformOp,
    PlacePivotOp,
    SetLocalFrameOp,
    ShapeTransformOp,
    ShapeTransformState,
    AnimTrackEditOp,
    MultiOp,
    AddSplatOp,
    SplatRenameOp
};
