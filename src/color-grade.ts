import type { Color } from 'playcanvas';

const SH_C0 = 0.28209479177387814;

const dcDecode = (v: number) => v * SH_C0 + 0.5;
const dcEncode = (v: number) => (v - 0.5) / SH_C0;

const sigmoid = (v: number) => 1 / (1 + Math.exp(-v));
const invSigmoid = (v: number) => ((v <= 0) ? -400 : ((v >= 1) ? 400 : -Math.log(1 / v - 1)));

type GradeParams = {
    tintClr: Color,
    temperature: number,
    saturation: number,
    brightness: number,
    blackPoint: number,
    whitePoint: number,
    transparency: number
};

type RGB = { r: number, g: number, b: number };

// luma weights the saturation mix is taken about. They sum to 1 (to within float
// rounding: 0.9999999999999999), which is what keeps a uniform offset uniform
// through the mix - see gradeTerms.
const LUMA = [0.299, 0.587, 0.114];

// The grade reduced to what both the CPU and the GPU actually evaluate: a 3x3
// colour matrix, a per-channel offset and an alpha multiplier.
//
// This is the smallest form closed under composition, which is what per-gaussian
// colour needs: saturation mixes channels through LUMA, so scale-then-saturate is
// already a general 3x3, and composing two grades cannot be written back as
// (diagonal scale, scalar offset, saturation).
//
// `m` is column-major to match WGSL's mat3x3f(c0, c1, c2), i.e. m[col * 3 + row].
type GradeTerms = {
    m: number[],
    offset: RGB,
    transparency: number
};

// Sole definition of how the seven authored parameters collapse into the
// evaluated terms. Writes into `out` so per-frame callers don't allocate.
//
// The authored grade is `saturate(scale * c + offset)`, which in matrix form is
// A * diag(s) * c + A * (offset * 1) where A = sat * I + (1 - sat) * 1 * LUMA^T.
// Since LUMA sums to 1, A * 1 = 1, so the offset survives the mix unchanged and
// stays uniform across channels - it only stops being uniform once two grades
// with different matrices are composed. (Exact to ~1e-16, the rounding in the
// LUMA sum; a 4000-grade differential test against the pre-matrix implementation
// put the total error at 1.4e-14, far below float32.)
const gradeTerms = (p: GradeParams, out: GradeTerms): GradeTerms => {
    const range = 1 / (p.whitePoint - p.blackPoint);
    const s = [
        range * p.tintClr.r * (1 + p.temperature),
        range * p.tintClr.g,
        range * p.tintClr.b * (1 - p.temperature)
    ];
    const sat = p.saturation;

    // column j of A * diag(s): s[j] * (sat * e_j + (1 - sat) * LUMA[j] * 1)
    for (let j = 0; j < 3; ++j) {
        const mix = (1 - sat) * LUMA[j] * s[j];
        for (let i = 0; i < 3; ++i) {
            out.m[j * 3 + i] = mix + (i === j ? sat * s[j] : 0);
        }
    }

    const offset = -p.blackPoint + p.brightness;
    out.offset.r = offset;
    out.offset.g = offset;
    out.offset.b = offset;
    out.transparency = p.transparency;
    return out;
};

const createGradeTerms = (): GradeTerms => ({
    m: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    offset: { r: 0, g: 0, b: 0 },
    transparency: 1
});

// Pack the terms as the three rows of the affine colour transform, which is the
// form both grade shaders consume: row i is (m[i][0], m[i][1], m[i][2], offset[i]),
// so a graded channel is one dot product plus the packed constant. Writes 12
// floats into `out` (row-major) so per-frame callers don't allocate.
const gradeRows = (t: GradeTerms, out: Float32Array): Float32Array => {
    const { m, offset } = t;
    const o = [offset.r, offset.g, offset.b];
    for (let i = 0; i < 3; ++i) {
        out[i * 4] = m[i];
        out[i * 4 + 1] = m[3 + i];
        out[i * 4 + 2] = m[6 + i];
        out[i * 4 + 3] = o[i];
    }
    return out;
};

// Inverse of gradeRows. The packing is a pure permutation - no arithmetic - so a
// terms -> rows -> terms round trip loses nothing beyond the precision of the
// array it passed through, which is what lets a palette entry be copied between
// layers without drifting.
const gradeFromRows = (rows: Float32Array, transparency: number, out: GradeTerms): GradeTerms => {
    for (let i = 0; i < 3; ++i) {
        out.m[i] = rows[i * 4];
        out.m[3 + i] = rows[i * 4 + 1];
        out.m[6 + i] = rows[i * 4 + 2];
    }
    out.offset.r = rows[3];
    out.offset.g = rows[7];
    out.offset.b = rows[11];
    out.transparency = transparency;
    return out;
};

// `out` = `second` applied after `first`. Matrices multiply, the offset carries
// through the second matrix, and transparency composes multiplicatively because
// it is a factor on the sigmoid-domain alpha (see applyAlpha).
const composeGrades = (first: GradeTerms, second: GradeTerms, out: GradeTerms): GradeTerms => {
    const a = second.m;
    const b = first.m;
    const m = out.m === a || out.m === b ? new Array(9) : out.m;

    for (let j = 0; j < 3; ++j) {
        for (let i = 0; i < 3; ++i) {
            m[j * 3 + i] =
                a[i] * b[j * 3] +
                a[3 + i] * b[j * 3 + 1] +
                a[6 + i] * b[j * 3 + 2];
        }
    }

    const o = first.offset;
    const r = a[0] * o.r + a[3] * o.g + a[6] * o.b + second.offset.r;
    const g = a[1] * o.r + a[4] * o.g + a[7] * o.b + second.offset.g;
    const bl = a[2] * o.r + a[5] * o.g + a[8] * o.b + second.offset.b;

    for (let i = 0; i < 9; ++i) out.m[i] = m[i];
    out.offset.r = r;
    out.offset.g = g;
    out.offset.b = bl;
    out.transparency = first.transparency * second.transparency;
    return out;
};

const IDENTITY_M = [1, 0, 0, 0, 1, 0, 0, 0, 1];

class ColorGrade {
    private m: number[];
    private offset: RGB;
    private transparency: number;

    // whether the grade touches colour / alpha at all, so the exporter can skip
    // the per-channel work when it doesn't
    readonly hasTint: boolean;
    readonly hasTransparency: boolean;

    // the terms are copied: callers pass a scratch object they go on reusing
    constructor(terms: GradeTerms) {
        this.m = terms.m.slice();
        this.offset = { ...terms.offset };
        this.transparency = terms.transparency;

        this.hasTint =
            this.m.some((v, i) => v !== IDENTITY_M[i]) ||
            this.offset.r !== 0 || this.offset.g !== 0 || this.offset.b !== 0;
        this.hasTransparency = this.transparency !== 1;
    }

    // `withOffset` is what splits DC from SH: the offset is a constant term, so it
    // belongs to the DC colour only, while every SH coefficient takes the linear
    // part alone. That split is why the matrix form bakes exactly on export.
    private apply(c: RGB, withOffset: boolean) {
        const m = this.m;
        const { r, g, b } = c;
        c.r = m[0] * r + m[3] * g + m[6] * b;
        c.g = m[1] * r + m[4] * g + m[7] * b;
        c.b = m[2] * r + m[5] * g + m[8] * b;

        if (withOffset) {
            c.r += this.offset.r;
            c.g += this.offset.g;
            c.b += this.offset.b;
        }
    }

    applyDC(c: RGB) {
        this.apply(c, true);
    }

    applySH(c: RGB) {
        this.apply(c, false);
    }

    applyOpacity(o: number): number {
        return invSigmoid(sigmoid(o) * this.transparency);
    }

    applyAlpha(o: number): number {
        return sigmoid(o) * this.transparency;
    }
}

export { ColorGrade, composeGrades, createGradeTerms, gradeFromRows, gradeRows, gradeTerms, dcDecode, dcEncode, sigmoid, invSigmoid, SH_C0, LUMA };
export type { GradeParams, GradeTerms, RGB };
