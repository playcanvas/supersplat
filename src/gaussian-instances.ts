import {
    BUFFERUSAGE_COPY_DST,
    BUFFERUSAGE_COPY_SRC,
    GraphicsDevice,
    StorageBuffer
} from 'playcanvas';

import { IndexRanges } from './index-ranges';
import { State } from './splat-state';

// The live edited data: a list of gaussian instances. Instance i references a
// row of the immutable static data (`sourceRow[i]`) and carries the editor
// state that belongs to *this* instance rather than to the static gaussian:
// selection/lock/delete flags and a transform palette index (a colour palette
// index will join it in the low/high halves of `palette`).
//
// Instances are the iteration domain for every editor pass; only geometry,
// colour and SH texture fetches remain in source-row space, reached through
// `sourceRow`. Today the list is always the identity over one source, so
// `count === source.numRows` and `sourceRow[i] === i`.
//
// This is the sole writer of its arrays: mutators record a dirty range and
// keep the counts current, then flush() uploads to the GPU mirrors.
class GaussianInstances {
    count: number;

    // instance -> static row
    readonly sourceRow: Uint32Array;
    // selected = 1, locked = 2, deleted = 4 (a byte view over flagWords)
    readonly flags: Uint8Array;
    // transform palette index in the low 16 bits
    readonly palette: Uint32Array;

    // gpu mirrors, indexed by instance. flags are read as packed u32 words
    readonly instanceSource: StorageBuffer;
    readonly instanceFlags: StorageBuffer;
    readonly instancePalette: StorageBuffer;

    // true while instance i maps to source row i, i.e. the list has never been
    // cloned into or compacted. lets the CPU-side source sweeps (splat-pick,
    // export) keep indexing by row until those paths learn the general mapping
    identity = true;

    // counts, maintained incrementally by mutate()
    numSelected = 0;
    numLocked = 0;
    numDeleted = 0;

    private readonly flagWords: Uint32Array;
    private dirtyLo = -1;
    private dirtyHi = -1;
    private paletteDirtyLo = -1;
    private paletteDirtyHi = -1;
    private countsDirty = true;

    // `initialFlags` is the state column loaded from file (may be shorter than
    // the row count if the file carried none)
    constructor(device: GraphicsDevice, numRows: number, initialFlags?: Uint8Array) {
        this.count = numRows;

        this.sourceRow = new Uint32Array(numRows);
        for (let i = 0; i < numRows; ++i) {
            this.sourceRow[i] = i;
        }

        this.flagWords = new Uint32Array(Math.ceil(numRows / 4));
        this.flags = new Uint8Array(this.flagWords.buffer, 0, numRows);
        if (initialFlags) {
            this.flags.set(initialFlags.subarray(0, numRows));
        }

        this.palette = new Uint32Array(numRows);

        const usage = BUFFERUSAGE_COPY_DST | BUFFERUSAGE_COPY_SRC;
        this.instanceSource = new StorageBuffer(device, Math.max(4, numRows * 4), usage);
        this.instanceFlags = new StorageBuffer(device, Math.max(4, this.flagWords.length * 4), usage);
        this.instancePalette = new StorageBuffer(device, Math.max(4, numRows * 4), usage);

        // everything is dirty until the first flush
        this.dirtyLo = 0;
        this.dirtyHi = numRows;
        this.paletteDirtyLo = 0;
        this.paletteDirtyHi = numRows;
        this.instanceSource.write(0, this.sourceRow, 0, numRows);
    }

    destroy() {
        this.instanceSource.destroy();
        this.instanceFlags.destroy();
        this.instancePalette.destroy();
    }

    get byteSize() {
        return this.instanceSource.byteSize + this.instanceFlags.byteSize + this.instancePalette.byteSize;
    }

    // transform palette index of an instance
    transformIndex(instance: number): number {
        return this.palette[instance] & 0xffff;
    }

    setTransformIndex(instance: number, index: number) {
        this.palette[instance] = (this.palette[instance] & 0xffff0000) | (index & 0xffff);
        if (this.paletteDirtyLo < 0) {
            this.paletteDirtyLo = instance;
            this.paletteDirtyHi = instance + 1;
        } else {
            if (instance < this.paletteDirtyLo) this.paletteDirtyLo = instance;
            if (instance >= this.paletteDirtyHi) this.paletteDirtyHi = instance + 1;
        }
    }

    setBits(ranges: IndexRanges, mask: number): void {
        this.mutate(ranges, before => before | mask);
    }

    clearBits(ranges: IndexRanges, mask: number): void {
        this.mutate(ranges, before => before & ~mask);
    }

    toggleBits(ranges: IndexRanges, mask: number): void {
        this.mutate(ranges, before => before ^ mask);
    }

    // apply a per-instance flag change over the ranges, recording the dirty
    // span and keeping the counts up to date without a full rescan
    private mutate(ranges: IndexRanges, op: (before: number) => number) {
        const { flags } = this;
        let lo = Infinity;
        let hi = -1;
        ranges.forEach((i) => {
            const before = flags[i];
            const after = op(before);
            if (after !== before) {
                flags[i] = after;
                this.reclassify(before, after);
            }
            if (i < lo) lo = i;
            if (i >= hi) hi = i + 1;
        });
        if (hi > 0) {
            if (this.dirtyLo < 0) {
                this.dirtyLo = lo;
                this.dirtyHi = hi;
            } else {
                if (lo < this.dirtyLo) this.dirtyLo = lo;
                if (hi > this.dirtyHi) this.dirtyHi = hi;
            }
        }
    }

    // each instance contributes to at most one count, by priority
    // deleted > locked > selected
    private static bucket(s: number): number {
        if (s & State.deleted) return State.deleted;
        if (s & State.locked) return State.locked;
        if (s & State.selected) return State.selected;
        return 0;
    }

    private reclassify(before: number, after: number) {
        const from = GaussianInstances.bucket(before);
        const to = GaussianInstances.bucket(after);
        if (from === to) return;
        if (from === State.deleted) this.numDeleted--;
        else if (from === State.locked) this.numLocked--;
        else if (from === State.selected) this.numSelected--;
        if (to === State.deleted) this.numDeleted++;
        else if (to === State.locked) this.numLocked++;
        else if (to === State.selected) this.numSelected++;
    }

    // seed the counts from the loaded flags. only needed once per instance,
    // since every later change goes through mutate()
    private recount() {
        const { flags, count } = this;
        let numSelected = 0;
        let numLocked = 0;
        let numDeleted = 0;
        for (let i = 0; i < count; ++i) {
            const s = flags[i];
            if (s & State.deleted) {
                numDeleted++;
            } else if (s & State.locked) {
                numLocked++;
            } else if (s & State.selected) {
                numSelected++;
            }
        }
        this.numSelected = numSelected;
        this.numLocked = numLocked;
        this.numDeleted = numDeleted;
    }

    // upload the dirty spans of the flag and palette mirrors. cheap when
    // nothing changed; counts are already current (see mutate)
    flush(): void {
        if (this.countsDirty) {
            this.recount();
            this.countsDirty = false;
        }

        if (this.dirtyLo >= 0) {
            // storage buffer writes are in whole u32 words, so widen the byte
            // range out to word boundaries
            const firstWord = this.dirtyLo >> 2;
            const lastWord = Math.min(this.flagWords.length, (this.dirtyHi + 3) >> 2);
            this.instanceFlags.write(firstWord * 4, this.flagWords, firstWord, lastWord - firstWord);
            this.dirtyLo = -1;
            this.dirtyHi = -1;
        }

        if (this.paletteDirtyLo >= 0) {
            const first = this.paletteDirtyLo;
            const length = this.paletteDirtyHi - first;
            this.instancePalette.write(first * 4, this.palette, first, length);
            this.paletteDirtyLo = -1;
            this.paletteDirtyHi = -1;
        }
    }
}

export { GaussianInstances };
