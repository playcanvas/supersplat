import { describe, expect, it, vi } from 'vitest';

import { IndexRanges, sortedPredicate } from './index-ranges';

describe('sortedPredicate', () => {
    it('matches sorted ids once as indices increase', () => {
        const pred = sortedPredicate(new Uint32Array([1, 3]));

        expect([0, 1, 2, 3, 4].map(pred)).toEqual([false, true, false, true, false]);
    });
});

describe('IndexRanges', () => {
    it('reports empty ranges when no indices match', () => {
        const ranges = IndexRanges.fromPredicate(4, () => false);
        const visited: number[] = [];

        ranges.forEach(index => visited.push(index));

        expect(ranges.empty).toBe(true);
        expect(ranges.data).toEqual(new Uint32Array());
        expect(visited).toEqual([]);
    });

    it('stores single indices with high-bit markers', () => {
        const ranges = IndexRanges.fromPredicate(5, i => i === 1 || i === 3);
        const visited: number[] = [];

        ranges.forEach(index => visited.push(index));

        expect(ranges.empty).toBe(false);
        expect(ranges.data).toEqual(new Uint32Array([0x80000001, 0x80000003]));
        expect(visited).toEqual([1, 3]);
    });

    it('stores contiguous runs as start and count pairs', () => {
        const ranges = IndexRanges.fromPredicate(6, i => i >= 2 && i <= 4);
        const visited: number[] = [];

        ranges.forEach(index => visited.push(index));

        expect(ranges.data).toEqual(new Uint32Array([2, 3]));
        expect(visited).toEqual([2, 3, 4]);
    });

    it('emits a trailing run that reaches total', () => {
        const ranges = IndexRanges.fromPredicate(4, i => i >= 2);

        expect(ranges.data).toEqual(new Uint32Array([2, 2]));
    });

    it('calls the predicate for each candidate index in order', () => {
        const pred = vi.fn((i: number) => i === 2);

        IndexRanges.fromPredicate(4, pred);

        expect(pred.mock.calls.map(([i]) => i)).toEqual([0, 1, 2, 3]);
    });
});
