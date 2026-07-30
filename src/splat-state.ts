import { Texture } from 'playcanvas';

import { IndexRanges } from './index-ranges';

enum State {
    selected = 1,
    locked = 2,
    deleted = 4
}

// CPU/GPU mirror of the per-splat state byte (selected/locked/deleted bits).
// Mutators record a dirty range; flush() uploads to the GPU texture and refreshes
// the cached counts. Replaces the implicit "remember to call updateState() after
// mutating state[]" contract with an encapsulated owner.
class SplatState {
    // SplatState is the sole writer of this compact CPU mirror.
    readonly data: Uint8Array;
    private readonly gpu: Texture;
    private dirtyLo = -1;
    private dirtyHi = -1;

    // counts, maintained incrementally by the mutators below.
    numSelected = 0;
    numLocked = 0;
    numDeleted = 0;

    // set until the counts have been seeded from the loaded state bytes
    private countsDirty = true;

    constructor(data: Uint8Array, gpu: Texture) {
        this.data = data;
        this.gpu = gpu;

        // mark everything dirty so the first flush uploads whatever was loaded
        // from disk (ply state column) and seeds the counts.
        this.dirtyLo = 0;
        this.dirtyHi = data.length;
    }

    // each splat contributes to at most one count, by priority
    // deleted > locked > selected (matching the original full recount)
    private static bucket(s: number): number {
        if (s & State.deleted) return State.deleted;
        if (s & State.locked) return State.locked;
        if (s & State.selected) return State.selected;
        return 0;
    }

    // move one splat between counts after its state byte changed
    private reclassify(before: number, after: number) {
        const from = SplatState.bucket(before);
        const to = SplatState.bucket(after);
        if (from === to) return;
        if (from === State.deleted) this.numDeleted--;
        else if (from === State.locked) this.numLocked--;
        else if (from === State.selected) this.numSelected--;
        if (to === State.deleted) this.numDeleted++;
        else if (to === State.locked) this.numLocked++;
        else if (to === State.selected) this.numSelected++;
    }

    private markDirty(lo: number, hi: number) {
        if (this.dirtyLo < 0) {
            this.dirtyLo = lo;
            this.dirtyHi = hi;
        } else {
            if (lo < this.dirtyLo) this.dirtyLo = lo;
            if (hi > this.dirtyHi) this.dirtyHi = hi;
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

    // apply a per-byte state change over the ranges, recording the dirty span
    // and keeping the counts up to date without a full rescan
    private mutate(ranges: IndexRanges, op: (before: number) => number) {
        const { data } = this;
        let lo = Infinity;
        let hi = -1;
        ranges.forEach((i) => {
            const before = data[i];
            const after = op(before);
            if (after !== before) {
                data[i] = after;
                this.reclassify(before, after);
            }
            if (i < lo) lo = i;
            if (i >= hi) hi = i + 1;
        });
        if (hi > 0) this.markDirty(lo, hi);
    }

    // seed the counts from the loaded state bytes. only needed once per
    // instance, since every later change goes through mutate()
    private recount() {
        const { data } = this;
        let numSelected = 0;
        let numLocked = 0;
        let numDeleted = 0;
        for (let i = 0; i < data.length; ++i) {
            const s = data[i];
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

    // upload dirty bytes to the GPU texture. idempotent and cheap when nothing
    // is dirty; counts are already current (see mutate).
    flush(): void {
        if (this.countsDirty) {
            this.recount();
            this.countsDirty = false;
        }
        if (this.dirtyLo < 0) return;
        // full upload. sub-rect upload is a worthwhile future optimisation
        // (would drop a 4M-byte upload to a few KB for small selections) but
        // requires engine-side support; current path keeps the same behaviour
        // as the prior `updateState` lock/set/unlock pair.
        const buffer = this.gpu.lock() as Uint8Array;
        buffer.set(this.data);
        this.gpu.unlock();
        this.dirtyLo = -1;
        this.dirtyHi = -1;
    }
}

export { State, SplatState };
