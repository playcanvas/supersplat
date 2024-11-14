const rgb2hsv = (rgb: { r: number, g: number, b: number }) => {
    const r = rgb.r;
    const g = rgb.g;
    const b = rgb.b;
    const v = Math.max(r, g, b);
    const diff = v - Math.min(r, g, b);

    const diffc = (c: number) => {
        return (v - c) / 6 / diff + 1 / 2;
    };

    let h, s;

    if (diff === 0) {
        h = s = 0;
    } else {
        s = diff / v;
        const rr = diffc(r);
        const gg = diffc(g);
        const bb = diffc(b);

        if (r === v) {
            h = bb - gg;
        } else if (g === v) {
            h = (1 / 3) + rr - bb;
        } else if (b === v) {
            h = (2 / 3) + gg - rr;
        }
        if (h < 0) {
            h += 1;
        } else if (h > 1) {
            h -= 1;
        }
    }

    return { h, s, v };
};

const hsv2rgb = (hsv: { h: number, s: number, v: number }) => {
    const h = hsv.h;
    const s = hsv.s;
    const v = hsv.v;

    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);

    let r, g, b;

    switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
    }

    return { r, g, b };
};

export { rgb2hsv, hsv2rgb };
