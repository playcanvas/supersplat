class CubicSpline {
    // control times
    times: number[];

    // control data: in-tangent, point, out-tangent
    knots: number[];

    // dimension of the knot points
    dim: number;

    constructor(times: number[], knots: number[]) {
        this.times = times;
        this.knots = knots;
        this.dim = knots.length / times.length / 3;
    }

    evaluate(time: number, result: number[]) {
        const { times } = this;
        const last = times.length - 1;

        if (time <= times[0]) {
            this.getKnot(0, result);
        } else if (time >= times[last]) {
            this.getKnot(last, result);
        } else {
            let seg = 0;
            while (time >= times[seg + 1]) {
                seg++;
            }
            return this.evaluateSegment(seg, (time - times[seg]) / (times[seg + 1] - times[seg]), result);
        }
    }

    getKnot(index: number, result: number[]) {
        const { knots, dim } = this;
        const idx = index * 3 * dim;
        for (let i = 0; i < dim; ++i) {
            result[i] = knots[idx + i * 3 + 1];
        }
    }

    // evaluate the spline segment at the given normalized time t
    evaluateSegment(segment: number, t: number, result: number[]) {
        const { knots, dim } = this;

        const t2 = t * t;
        const twot = t + t;
        const omt = 1 - t;
        const omt2 = omt * omt;

        let idx = segment * dim * 3;                    // each knot has 3 values: tangent in, value, tangent out
        for (let i = 0; i < dim; ++i) {
            const p0 = knots[idx + 1];                  // p0
            const m0 = knots[idx + 2];                  // outgoing tangent
            const m1 = knots[idx + dim * 3];            // incoming tangent
            const p1 = knots[idx + dim * 3 + 1];        // p1
            idx += 3;

            result[i] =
                p0 * ((1 + twot) * omt2) +
                m0 * (t * omt2) +
                p1 * (t2 * (3 - twot)) +
                m1 * (t2 * (t - 1));
        }
    }

    // create cubic spline data from a set of control points to be interpolated
    // times: time values for each control point
    // points: control point values to be interpolated (n dimensional)
    // tension: level of smoothness, 0 = smooth, 1 = linear interpolation
    static fromPoints(times: number[], points: number[], tension = 0) {
        const dim = points.length / times.length;
        const knots = new Array<number>(times.length * dim * 3);

        for (let i = 0; i < times.length; i++) {
            const t = times[i];

            for (let j = 0; j < dim; j++) {
                const idx = i * dim + j;
                const p = points[idx];

                let tangent;
                if (i === 0) {
                    tangent = (points[idx + dim] - p) / (times[i + 1] - t);
                } else if (i === times.length - 1) {
                    tangent = (p - points[idx - dim]) / (t - times[i - 1]);
                } else {
                    // finite difference tangents
                    tangent = 0.5 * ((points[idx + dim] - p) / (times[i + 1] - t) + (p - points[idx - dim]) / (t - times[i - 1]));

                    // cardinal spline tangents
                    // tangent = (points[idx + dim] - points[idx - dim]) / (times[i + 1] - times[i - 1]);
                }

                // apply tension
                tangent *= (1.0 - tension);

                knots[idx * 3] = tangent;
                knots[idx * 3 + 1] = p;
                knots[idx * 3 + 2] = tangent;
            }
        }

        return new CubicSpline(times, knots);
    }

    // create a looping spline by duplicating animation points at the end and beginning
    static fromPointsLooping(length: number, times: number[], points: number[], tension = 0) {
        if (times.length <= 2) {
            return CubicSpline.fromPoints(times, points, tension);
        }

        const dim = points.length / times.length;
        const newTimes = times.slice();
        const newPoints = points.slice();

        // append first two points
        newTimes.push(length + times[0], length + times[1]);
        newPoints.push(...points.slice(0, dim * 2));

        // prepend last two points
        newTimes.splice(0, 0, times[times.length - 2] - length, times[times.length - 1] - length);
        newPoints.splice(0, 0, ...points.slice(points.length - dim * 2));

        return CubicSpline.fromPoints(newTimes, newPoints, tension);
    }
}

export { CubicSpline };
