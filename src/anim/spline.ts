/**
 * Given an array of data points, compute the Hermite tangents
 * that make the cubic Hermite spline C2 continuous.
 *
 * Each point should be an object with properties 'time' and 'value'.
 * This function uses natural boundary conditions (M[0] = M[n-1] = 0).
 *
 * @param {Array} points - Array of points, e.g. [{time:0, value:0}, {time:1, value:2}, ...]
 * @returns {Array} tangents - Array of tangent values at each point.
 */
function computeC2Tangents(points: {time: number, value: number}[]) {
    const n = points.length;
    if (n < 2) {
        return [];
    }

    // Step 1. Compute the intervals (h) and the slopes (d).
    // h[i] = points[i+1].time - points[i].time
    // d[i] = (points[i+1].value - points[i].value) / h[i]
    const h = [];
    const d = [];
    for (let i = 0; i < n - 1; i++) {
        const dt = points[i + 1].time - points[i].time;
        if (dt === 0) {
            throw new Error("Two points have the same time value.");
        }
        h.push(dt);
        d.push((points[i + 1].value - points[i].value) / dt);
    }

    // Step 2. Set up and solve the tridiagonal system for the second derivatives M.
    // For a natural cubic spline, we have M[0] = M[n-1] = 0.
    // For interior points (i = 1, …, n-2):
    //   (h[i-1]/6)*M[i-1] + ((h[i-1]+h[i])/3)*M[i] + (h[i]/6)*M[i+1] = d[i] - d[i-1]
    const M = new Array(n).fill(0); // Second derivatives; endpoints remain 0.
    
    // Arrays for the Thomas algorithm (tridiagonal system solver).
    const a = new Array(n).fill(0); // sub-diagonal
    const b = new Array(n).fill(0); // diagonal
    const c = new Array(n).fill(0); // super-diagonal
    const r = new Array(n).fill(0); // right-hand side

    // Set the boundary condition at the first point.
    b[0] = 1;
    r[0] = 0;

    // Set up the equations for the interior points.
    for (let i = 1; i < n - 1; i++) {
        a[i] = h[i - 1] / 6;
        b[i] = (h[i - 1] + h[i]) / 3;
        c[i] = h[i] / 6;
        r[i] = d[i] - d[i - 1];
    }

    // Boundary condition at the last point.
    b[n - 1] = 1;
    r[n - 1] = 0;

    // Solve the tridiagonal system using the Thomas algorithm.
    // Forward sweep.
    for (let i = 1; i < n; i++) {
        const w = a[i] / b[i - 1];
        b[i] = b[i] - w * c[i - 1];
        r[i] = r[i] - w * r[i - 1];
    }

    // Back substitution.
    M[n - 1] = r[n - 1] / b[n - 1];
    for (let i = n - 2; i >= 0; i--) {
        M[i] = (r[i] - c[i] * M[i + 1]) / b[i];
    }

    // Step 3. Compute the Hermite tangents (first derivatives) from the M values.
    // For i = 0, …, n-2:
    //   m[i] = d[i] - (h[i] * (2*M[i] + M[i+1])) / 6
    // For the last point (i = n-1):
    //   m[n-1] = d[n-2] + (h[n-2] * (2*M[n-1] + M[n-2])) / 6
    const m = new Array(n);
    for (let i = 0; i < n - 1; i++) {
        m[i] = d[i] - (h[i] * (2 * M[i] + M[i + 1])) / 6;
    }
    m[n - 1] = d[n - 2] + (h[n - 2] * (2 * M[n - 1] + M[n - 2])) / 6;

    return m;
}

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

    static fromPointsC2(times: number[], points: number[]) {

    }
}

export { CubicSpline };
