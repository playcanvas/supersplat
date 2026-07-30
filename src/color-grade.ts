import { Color } from 'playcanvas';

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

// the grade reduced to what both the CPU and the GPU actually evaluate: a
// per-channel scale, a scalar offset, a saturation mix and an alpha multiplier
type GradeTerms = {
    scale: RGB,
    offset: number,
    saturation: number,
    transparency: number
};

// sole definition of how the seven authored parameters collapse into the four
// evaluated terms. writes into `out` so per-frame callers don't allocate
const gradeTerms = (p: GradeParams, out: GradeTerms): GradeTerms => {
    const scale = 1 / (p.whitePoint - p.blackPoint);
    out.scale.r = scale * p.tintClr.r * (1 + p.temperature);
    out.scale.g = scale * p.tintClr.g;
    out.scale.b = scale * p.tintClr.b * (1 - p.temperature);
    out.offset = -p.blackPoint + p.brightness;
    out.saturation = p.saturation;
    out.transparency = p.transparency;
    return out;
};

const createGradeTerms = (): GradeTerms => ({
    scale: { r: 1, g: 1, b: 1 }, offset: 0, saturation: 1, transparency: 1
});

class ColorGrade {
    private s: RGB;
    private offset: number;
    private saturation: number;
    private transparency: number;

    readonly hasTint: boolean;

    constructor(p: GradeParams) {
        const terms = gradeTerms(p, createGradeTerms());
        this.s = terms.scale;
        this.offset = terms.offset;
        this.saturation = terms.saturation;
        this.transparency = terms.transparency;

        this.hasTint = (
            !p.tintClr.equals(Color.WHITE) ||
            p.temperature !== 0 ||
            p.saturation !== 1 ||
            p.brightness !== 0 ||
            p.blackPoint !== 0 ||
            p.whitePoint !== 1
        );
    }

    private apply(c: RGB, offset: number) {
        c.r = offset + c.r * this.s.r;
        c.g = offset + c.g * this.s.g;
        c.b = offset + c.b * this.s.b;

        const grey = c.r * 0.299 + c.g * 0.587 + c.b * 0.114;
        c.r = grey + (c.r - grey) * this.saturation;
        c.g = grey + (c.g - grey) * this.saturation;
        c.b = grey + (c.b - grey) * this.saturation;
    }

    applyDC(c: RGB) {
        this.apply(c, this.offset);
    }

    applySH(c: RGB) {
        this.apply(c, 0);
    }

    applyOpacity(o: number): number {
        return invSigmoid(sigmoid(o) * this.transparency);
    }

    applyAlpha(o: number): number {
        return sigmoid(o) * this.transparency;
    }
}

export { ColorGrade, createGradeTerms, gradeTerms, dcDecode, dcEncode, sigmoid, invSigmoid, SH_C0 };
export type { GradeParams, GradeTerms, RGB };
