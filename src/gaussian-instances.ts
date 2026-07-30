import {
    BUFFERUSAGE_COPY_DST,
    BUFFERUSAGE_COPY_SRC,
    GraphicsDevice,
    StorageBuffer
} from 'playcanvas';

import { IndexRanges } from './index-ranges';
import { State } from './splat-state';

// The removed records of one edit, enough to undo it exactly. `ranges` are the
// positions they occupied, in the pre-removal index space.
type RemovedInstances = {
    ranges: IndexRanges;
    sourceRow: Uint32Array;
    flags: Uint8Array;
    palette: Uint32Array;
};

// the PLY state column's deleted bit. instances have no deleted state, so rows
// a file marks deleted are simply not instanced at load
const FILE_STATE_DELETED = 4;

// a dirty span of instances awaiting upload. -1 lo means clean
class DirtySpan {
    lo = -1;
    hi = -1;

    add(lo: number, hi: number) {
        if (this.lo < 0) {
            this.lo = lo;
            this.hi = hi;
        } else {
            if (lo < this.lo) this.lo = lo;
            if (hi > this.hi) this.hi = hi;
        }
    }

    clear() {
        this.lo = -1;
        this.hi = -1;
    }

    get dirty() {
        return this.lo >= 0;
    }
}

// The live edited data: a list of gaussian instances. Instance i references a
// row of the immutable static data (`sourceRow[i]`) and carries the editor
// state that belongs to *this* instance rather than to the static gaussian:
// selection/lock flags and a transform palette index (a colour palette index
// will join it in the low/high halves of `palette`).
//
// Instances are the iteration domain for every editor pass; only geometry,
// colour and SH texture fetches remain in source-row space, reached through
// `sourceRow`. Today the list is always the identity over one source, so
// `count === source.numRows` and `sourceRow[i] === i`, but nothing may assume it.
//
// This is the sole writer of its arrays: mutators record a dirty range and
// keep the counts current, then flush() uploads to the GPU mirrors.
class GaussianInstances {
    count: number;

    // instance -> static row
    readonly sourceRow: Uint32Array;
    // selected = 1, locked = 2 (a byte view over flagWords)
    readonly flags: Uint8Array;
    // transform palette index in the low 16 bits
    readonly palette: Uint32Array;

    // gpu mirrors, indexed by instance. flags are read as packed u32 words
    readonly instanceSource: StorageBuffer;
    readonly instanceFlags: StorageBuffer;
    readonly instancePalette: StorageBuffer;

    // counts, maintained incrementally by mutate()
    numSelected = 0;
    numLocked = 0;
    // instances removed and not (yet) restored, i.e. how much of the scene the
    // user has deleted
    numRemoved = 0;

    private readonly flagWords: Uint32Array;
    private readonly flagSpan = new DirtySpan();
    private readonly paletteSpan = new DirtySpan();
    private readonly sourceSpan = new DirtySpan();
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
        this.palette = new Uint32Array(numRows);

        if (initialFlags) {
            this.flags.set(initialFlags.subarray(0, numRows));
            // scene.reset brings these back by appending the unreferenced rows
            this.remove(IndexRanges.fromPredicate(numRows, i => (this.flags[i] & FILE_STATE_DELETED) !== 0));
        }

        const usage = BUFFERUSAGE_COPY_DST | BUFFERUSAGE_COPY_SRC;
        this.instanceSource = new StorageBuffer(device, Math.max(4, numRows * 4), usage);
        this.instanceFlags = new StorageBuffer(device, Math.max(4, this.flagWords.length * 4), usage);
        this.instancePalette = new StorageBuffer(device, Math.max(4, numRows * 4), usage);

        // everything is dirty until the first flush
        this.markDirty(0, this.count);
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
        this.paletteSpan.add(instance, instance + 1);
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

    // Remove instances, preserving the order of those that remain, and return
    // the removed records so the edit can be undone exactly. `ranges` are
    // positions in the current index space.
    remove(ranges: IndexRanges): RemovedInstances {
        const total = ranges.count;
        const removed: RemovedInstances = {
            ranges,
            sourceRow: new Uint32Array(total),
            flags: new Uint8Array(total),
            palette: new Uint32Array(total)
        };
        if (total === 0) {
            return removed;
        }

        const { sourceRow, flags, palette } = this;
        let first = -1;
        let dst = 0;
        let src = 0;
        let out = 0;
        ranges.forEachRun((start, count) => {
            if (first < 0) {
                first = start;
                dst = start;
                src = start;
            }
            // shift the kept span preceding this run down over the gap. it lands
            // below `start`, so the records captured next are still intact
            if (start > src) {
                sourceRow.copyWithin(dst, src, start);
                flags.copyWithin(dst, src, start);
                palette.copyWithin(dst, src, start);
                dst += start - src;
            }
            removed.sourceRow.set(sourceRow.subarray(start, start + count), out);
            removed.flags.set(flags.subarray(start, start + count), out);
            removed.palette.set(palette.subarray(start, start + count), out);
            out += count;
            src = start + count;
        });
        if (this.count > src) {
            sourceRow.copyWithin(dst, src, this.count);
            flags.copyWithin(dst, src, this.count);
            palette.copyWithin(dst, src, this.count);
            dst += this.count - src;
        }

        this.count = dst;
        this.numRemoved += total;
        this.markDirty(first, dst);
        this.countsDirty = true;
        return removed;
    }

    // Re-insert removed records at the positions they came from: the exact
    // inverse of remove(), which the strict-LIFO edit history relies on.
    insert(removed: RemovedInstances) {
        const total = removed.sourceRow.length;
        if (total === 0) {
            return;
        }

        const { sourceRow, flags, palette } = this;
        const runs: number[] = [];
        removed.ranges.forEachRun((start, count) => runs.push(start, count));

        // walk the runs backwards, moving the kept elements above each gap up
        // before filling it, so nothing is overwritten before it has moved
        let dstEnd = this.count + total;
        let srcEnd = this.count;
        let out = total;
        for (let r = runs.length - 2; r >= 0; r -= 2) {
            const start = runs[r];
            const count = runs[r + 1];
            const keep = dstEnd - (start + count);
            if (keep > 0) {
                sourceRow.copyWithin(dstEnd - keep, srcEnd - keep, srcEnd);
                flags.copyWithin(dstEnd - keep, srcEnd - keep, srcEnd);
                palette.copyWithin(dstEnd - keep, srcEnd - keep, srcEnd);
                srcEnd -= keep;
            }
            out -= count;
            sourceRow.set(removed.sourceRow.subarray(out, out + count), start);
            flags.set(removed.flags.subarray(out, out + count), start);
            palette.set(removed.palette.subarray(out, out + count), start);
            dstEnd = start;
        }

        this.count += total;
        this.numRemoved -= total;
        this.markDirty(runs[0], this.count);
        this.countsDirty = true;
    }

    // Append a clean instance for every static row nothing references, and
    // return how many were added. The arrays are sized to the row count and
    // instances reference distinct rows, so this cannot overflow; cloning will
    // bring a growth policy with it.
    appendMissing(numRows: number): number {
        const present = new Uint8Array(numRows);
        for (let i = 0; i < this.count; ++i) {
            present[this.sourceRow[i]] = 1;
        }

        const first = this.count;
        let at = first;
        for (let row = 0; row < numRows; ++row) {
            if (!present[row]) {
                this.sourceRow[at] = row;
                this.flags[at] = 0;
                this.palette[at] = 0;
                at++;
            }
        }

        if (at > first) {
            this.count = at;
            this.numRemoved -= at - first;
            this.markDirty(first, at);
            this.countsDirty = true;
        }
        return at - first;
    }

    // Drop the last `n` instances: the inverse of appendMissing. Nothing reads
    // past `count`, so the mirrors don't need re-uploading.
    truncate(n: number) {
        if (n > 0) {
            this.count -= n;
            this.numRemoved += n;
            this.countsDirty = true;
        }
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
            this.flagSpan.add(lo, hi);
        }
    }

    private markDirty(lo: number, hi: number) {
        this.flagSpan.add(lo, hi);
        this.paletteSpan.add(lo, hi);
        this.sourceSpan.add(lo, hi);
    }

    // each instance contributes to at most one count, locked taking priority
    private static bucket(s: number): number {
        if (s & State.locked) return State.locked;
        if (s & State.selected) return State.selected;
        return 0;
    }

    private reclassify(before: number, after: number) {
        const from = GaussianInstances.bucket(before);
        const to = GaussianInstances.bucket(after);
        if (from === to) return;
        if (from === State.locked) this.numLocked--;
        else if (from === State.selected) this.numSelected--;
        if (to === State.locked) this.numLocked++;
        else if (to === State.selected) this.numSelected++;
    }

    // reseed the counts from the flags. needed on load and after the list is
    // resized; every flag change goes through mutate(), which stays current
    private recount() {
        const { flags, count } = this;
        let numSelected = 0;
        let numLocked = 0;
        for (let i = 0; i < count; ++i) {
            const s = flags[i];
            if (s & State.locked) {
                numLocked++;
            } else if (s & State.selected) {
                numSelected++;
            }
        }
        this.numSelected = numSelected;
        this.numLocked = numLocked;
    }

    // upload the dirty spans of the gpu mirrors. cheap when nothing changed;
    // counts are already current unless the list was resized
    flush(): void {
        if (this.countsDirty) {
            this.recount();
            this.countsDirty = false;
        }

        if (this.flagSpan.dirty) {
            // storage buffer writes are in whole u32 words, so widen the byte
            // range out to word boundaries
            const firstWord = this.flagSpan.lo >> 2;
            const lastWord = Math.min(this.flagWords.length, (this.flagSpan.hi + 3) >> 2);
            this.instanceFlags.write(firstWord * 4, this.flagWords, firstWord, lastWord - firstWord);
            this.flagSpan.clear();
        }

        if (this.paletteSpan.dirty) {
            const { lo, hi } = this.paletteSpan;
            this.instancePalette.write(lo * 4, this.palette, lo, hi - lo);
            this.paletteSpan.clear();
        }

        if (this.sourceSpan.dirty) {
            const { lo, hi } = this.sourceSpan;
            this.instanceSource.write(lo * 4, this.sourceRow, lo, hi - lo);
            this.sourceSpan.clear();
        }
    }
}

// Group instance indices by the source chunk they read from, so a CPU pass that
// must walk the source file sequentially (splat-pick, export filtering) can
// visit every instance referencing the chunk it just read. A counting sort, so
// it costs O(count) and leaves each group in ascending instance order.
const groupInstancesByChunk = (instances: GaussianInstances, chunkSize: number, numChunks: number) => {
    const { sourceRow, count } = instances;
    // starts[c]..starts[c + 1] is chunk c's slice of `ordered`
    const starts = new Uint32Array(numChunks + 1);
    for (let i = 0; i < count; ++i) {
        starts[Math.floor(sourceRow[i] / chunkSize) + 1]++;
    }
    for (let c = 0; c < numChunks; ++c) {
        starts[c + 1] += starts[c];
    }
    const cursors = starts.slice(0, numChunks);
    const ordered = new Uint32Array(count);
    for (let i = 0; i < count; ++i) {
        ordered[cursors[Math.floor(sourceRow[i] / chunkSize)]++] = i;
    }
    return { starts, ordered };
};

export { GaussianInstances, groupInstancesByChunk };
export type { RemovedInstances };
