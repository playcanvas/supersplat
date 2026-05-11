import { describe, expect, it } from 'vitest';

import { CubicSpline } from './spline';

describe('CubicSpline', () => {
    it('returns endpoint knots when evaluated outside control time range', () => {
        const spline = new CubicSpline([1, 3], [
            0, 10, 2,
            -2, 30, 0
        ]);
        const result = [0];

        spline.evaluate(0, result);
        expect(result).toEqual([10]);

        spline.evaluate(4, result);
        expect(result).toEqual([30]);
    });

    it('evaluates interior cubic segments and skips earlier segments by time', () => {
        const spline = new CubicSpline([0, 1, 3], [
            0, 0, 0,
            0, 10, 0,
            0, 20, 0
        ]);
        const result = [0];

        spline.evaluate(2, result);

        expect(result[0]).toBe(15);
    });

    it('evaluates multidimensional segment values', () => {
        const spline = new CubicSpline([0, 2], [
            0, 0, 0,
            0, 10, 0,
            0, 20, 0,
            0, 30, 0
        ]);
        const result = [0, 0];

        spline.evaluateSegment(0, 0.5, result);

        expect(result).toEqual([10, 20]);
    });

    it('builds knots from points with endpoint and middle tangents', () => {
        expect(CubicSpline.calcKnots([0, 2, 6], [0, 4, 16], 0.5)).toEqual([
            0.5 * 2 * 2, 0, 0.5 * 2 * 2,
            0.5 * (16 / 6) * 2, 4, 0.5 * (16 / 6) * 4,
            0.5 * 3 * 4, 16, 0.5 * 3 * 4
        ]);
    });

    it('creates splines from points using default smoothness', () => {
        const spline = CubicSpline.fromPoints([0, 1], [0, 2]);
        const result = [0];

        spline.evaluate(0.5, result);

        expect(result[0]).toBe(1);
    });

    it('leaves looping splines unchanged when there are fewer than two keys', () => {
        const spline = CubicSpline.fromPointsLooping(10, [2], [8]);
        const result = [0];

        spline.evaluate(2, result);

        expect(result).toEqual([8]);
    });

    it('extends looping splines with wrapped points before building knots', () => {
        const spline = CubicSpline.fromPointsLooping(10, [1, 4, 7], [
            10, 100,
            20, 200,
            30, 300
        ], 0);

        expect(spline.times).toEqual([-6, -3, 1, 4, 7, 11, 14]);
        expect(spline.knots.map(v => (Object.is(v, -0) ? 0 : v))).toEqual([
            0, 20, 0,
            0, 200, 0,
            0, 30, 0,
            0, 300, 0,
            0, 10, 0,
            0, 100, 0,
            0, 20, 0,
            0, 200, 0,
            0, 30, 0,
            0, 300, 0,
            0, 10, 0,
            0, 100, 0,
            0, 20, 0,
            0, 200, 0
        ]);
    });
});
