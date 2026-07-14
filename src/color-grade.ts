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

class ColorGrade {
    private s: RGB;
    private offset: number;
    private saturation: number;
    private transparency: number;

    readonly hasTint: boolean;

    constructor(p: GradeParams) {
        const scale = 1 / (p.whitePoint - p.blackPoint);
        this.s = {
            r: scale * p.tintClr.r * (1 + p.temperature),
            g: scale * p.tintClr.g,
            b: scale * p.tintClr.b * (1 - p.temperature)
        };
        this.offset = -p.blackPoint + p.brightness;
        this.saturation = p.saturation;
        this.transparency = p.transparency;

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

export { ColorGrade, dcDecode, dcEncode, sigmoid, invSigmoid, SH_C0 };
export type { GradeParams, RGB };
