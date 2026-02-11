// High bit flags a single index entry (1 uint32) vs a range pair [start, count] (2 uint32s).
// This limits index values to 2^31 - 1, which is sufficient for any practical gaussian count.
const SINGLE_BIT = 0x80000000;
const INDEX_MASK = 0x7FFFFFFF;

// Emit a run of contiguous indices to the ranges array.
const emit = (ranges: number[], start: number, count: number) => {
    if (count === 1) {
        ranges.push(start | SINGLE_BIT);
    } else {
        ranges.push(start, count);
    }
};

/**
 * Create a cursor-based membership predicate from sorted unique IDs. Returns a function
 * that tests whether a given index is in the set. Must be called with strictly increasing
 * values of i (as IndexRanges.fromPredicate guarantees).
 */
const sortedPredicate = (sortedIds: Uint32Array): (i: number) => boolean => {
    let cursor = 0;
    return (i: number) => {
        if (cursor < sortedIds.length && sortedIds[cursor] === i) {
            cursor++;
            return true;
        }
        return false;
    };
};

/**
 * A compact container for storing and iterating sets of indices. Internally stores contiguous
 * runs as [start, count] pairs and lone indices as single entries with a high-bit flag.
 * Efficient for spatially coherent data where selections form long contiguous runs.
 */
class IndexRanges {
    readonly data: Uint32Array;

    private constructor(data: Uint32Array) {
        this.data = data;
    }

    /**
     * Build ranges by scanning [0, total) and including indices where pred returns true.
     * Single pass, O(total).
     */
    static fromPredicate(total: number, pred: (i: number) => boolean) {
        const ranges: number[] = [];
        let rangeStart = -1;

        for (let i = 0; i < total; ++i) {
            if (pred(i)) {
                if (rangeStart === -1) rangeStart = i;
            } else if (rangeStart !== -1) {
                emit(ranges, rangeStart, i - rangeStart);
                rangeStart = -1;
            }
        }
        if (rangeStart !== -1) {
            emit(ranges, rangeStart, total - rangeStart);
        }

        return new IndexRanges(new Uint32Array(ranges));
    }

    /** Whether there are no indices. */
    get empty() {
        return this.data.length === 0;
    }

    /** Iterate each index. */
    forEach(fn: (index: number) => void) {
        const { data } = this;
        let r = 0;
        while (r < data.length) {
            if (data[r] & SINGLE_BIT) {
                fn(data[r] & INDEX_MASK);
                r += 1;
            } else {
                for (let i = data[r], end = data[r] + data[r + 1]; i < end; i++) {
                    fn(i);
                }
                r += 2;
            }
        }
    }
}

export { IndexRanges, sortedPredicate };
