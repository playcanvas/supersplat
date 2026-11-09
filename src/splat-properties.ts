// gpu propMode constants. these must match the propMode dispatch in
// src/shaders/splat-value-shader.ts.
//
// modes 5..7 and 18..20 read the final on-screen color (DC + evaluated SH for
// the current view direction), so they are camera-dependent.
// modes 66..68 read the raw f_dc_N coefficients reconstructed from the
// already-decoded splatColor texture.
const PROP_MODE: Record<string, number> = {
    x: 0,
    y: 1,
    z: 2,
    distance: 3,
    'camera-depth': 4,
    red: 5,
    green: 6,
    blue: 7,
    opacity: 8,
    scale_0: 9,
    scale_1: 10,
    scale_2: 11,
    volume: 12,
    'surface-area': 13,
    rot_0: 14,
    rot_1: 15,
    rot_2: 16,
    rot_3: 17,
    hue: 18,
    saturation: 19,
    value: 20,
    f_dc_0: 66,
    f_dc_1: 67,
    f_dc_2: 68
};

// f_rest_N maps to mode (21 + N). max 45 SH coefficients (shBands 3).
const F_REST_BASE_MODE = 21;

const SH_NUM_COEFFS: Record<number, number> = { 0: 0, 1: 3, 2: 8, 3: 15 };

const propModeFor = (prop: string): number | undefined => {
    if (Object.hasOwn(PROP_MODE, prop)) return PROP_MODE[prop];
    const m = /^f_rest_(\d+)$/.exec(prop);
    if (m) return F_REST_BASE_MODE + parseInt(m[1], 10);
    return undefined;
};

// final-color (DC + evaluated SH for current view direction) — depends on
// world-space splat position, camera position and ColorGrade.
const isFinalColorMode = (mode: number) => {
    return (mode >= 5 && mode <= 7) || (mode >= 18 && mode <= 20);
};

export { PROP_MODE, propModeFor, SH_NUM_COEFFS, isFinalColorMode };
