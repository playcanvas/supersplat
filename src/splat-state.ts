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
    // shared with splatData.getProp('state') so existing read consumers keep
    // working without any indirection. SplatState is the sole writer.
    readonly data: Uint8Array;
    private readonly gpu: Texture;
    private dirtyLo = -1;
    private dirtyHi = -1;

    // cached counts, refreshed by flush().
    numSelected = 0;
    numLocked = 0;
    numDeleted = 0;

    constructor(data: Uint8Array, gpu: Texture) {
        this.data = data;
        this.gpu = gpu;

        // mark everything dirty so the first flush uploads whatever was loaded
        // from disk (ply state column) and seeds the cached counts.
        this.dirtyLo = 0;
        this.dirtyHi = data.length;
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
        const { data } = this;
        let lo = Infinity;
        let hi = -1;
        ranges.forEach((i) => {
            data[i] |= mask;
            if (i < lo) lo = i;
            if (i >= hi) hi = i + 1;
        });
        if (hi > 0) this.markDirty(lo, hi);
    }

    clearBits(ranges: IndexRanges, mask: number): void {
        const { data } = this;
        let lo = Infinity;
        let hi = -1;
        ranges.forEach((i) => {
            data[i] &= ~mask;
            if (i < lo) lo = i;
            if (i >= hi) hi = i + 1;
        });
        if (hi > 0) this.markDirty(lo, hi);
    }

    toggleBits(ranges: IndexRanges, mask: number): void {
        const { data } = this;
        let lo = Infinity;
        let hi = -1;
        ranges.forEach((i) => {
            data[i] ^= mask;
            if (i < lo) lo = i;
            if (i >= hi) hi = i + 1;
        });
        if (hi > 0) this.markDirty(lo, hi);
    }

    // recount selected/locked/deleted from scratch. cheap relative to a GPU
    // readback (single CPU pass over numSplats bytes) and only triggered from
    // flush, so the same call that uploads to GPU also refreshes counts.
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

    // upload dirty bytes to the GPU texture and refresh cached counts.
    // idempotent and cheap when nothing is dirty.
    flush(): void {
        if (this.dirtyLo < 0) return;
        // full upload. sub-rect upload is a worthwhile future optimisation
        // (would drop a 4M-byte upload to a few KB for small selections) but
        // requires engine-side support; current path keeps the same behaviour
        // as the prior `updateState` lock/set/unlock pair.
        const buffer = this.gpu.lock() as Uint8Array;
        buffer.set(this.data);
        this.gpu.unlock();
        this.recount();
        this.dirtyLo = -1;
        this.dirtyHi = -1;
    }
}

export { State, SplatState };
