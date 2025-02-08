class CubicSpline {
    // control times
    times;

    // control data: in-tangent, point, out-tangent
    knots;

    // dimension of the knot points
    dim;

    constructor(times, knots) {
        this.times = times;
        this.knots = knots;
        this.dim = knots.length / times.length / 3;
    }

    evaluate(time, result) {
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

    getKnot(index, result) {
        const { knots, dim } = this;
        const idx = index * 3 * dim;
        for (let i = 0; i < dim; ++i) {
            result[i] = knots[idx + i * 3 + 1];
        }
    }

    // evaluate the spline segment at the given normalized time t
    evaluateSegment(segment, t, result) {
        const { knots, dim } = this;

        const t2 = t * t;
        const twot = t + t;
        const omt = 1 - t;
        const omt2 = omt * omt;

        let idx = segment * 3 * dim;
        for (let i = 0; i < dim; ++i) {
            const p0 = knots[idx + 1];
            const m0 = knots[idx + 2];
            const m1 = knots[idx + 3 * dim];
            const p1 = knots[idx + 3 * dim + 1];
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
    static fromPoints(times, points, tension = 0) {
        const dim = points.length / times.length;
        const knots = new Array(times.length * dim * 3);

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
}

export { CubicSpline };
