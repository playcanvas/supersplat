// per-splat colour grade, evaluated identically on the GPU (here) and on the
// CPU (ColorGrade.apply in src/color-grade.ts) so the viewport, the data panel
// and the exported file agree.
//
// The grade is an affine colour transform passed as its three rows, each packing
// a matrix row and that channel's constant term: row i = (m[i][0..2], offset[i]).
// See gradeRows() for the packing. It is a general 3x3 rather than a per-channel
// scale because saturation mixes channels, and that is the only form closed under
// composition - which per-gaussian colour needs in order to apply one grade on top
// of another.
//
// The offset is applied here because both shaders grade the *final* view-dependent
// colour in one shot. The DC/SH split (offset on DC only, linear part on every SH
// coefficient) exists solely for baking on export, where the coefficients are
// graded individually - see ColorGrade.applyDC / applySH.
const applyColorGradeWGSL = /* wgsl */`
fn applyColorGrade(color: vec3f, row0: vec4f, row1: vec4f, row2: vec4f) -> vec3f {
    return vec3f(dot(row0.xyz, color), dot(row1.xyz, color), dot(row2.xyz, color))
        + vec3f(row0.w, row1.w, row2.w);
}`;

// colour palette entries per texture row. an entry is 4 texels: the three rows
// above, then the alpha multiplier in .x. shared with ColorPalette, which sizes
// its texture from it
const COLOR_PALETTE_ENTRIES_PER_ROW = 512;

// per-gaussian colour palette lookup, the committed half of the grade. Requires a
// `colorPalette: texture_2d<f32>` binding in scope. Entry 0 is the identity grade
// and is what every ungraded gaussian references, so the early return is the
// common path.
const paletteGradeWGSL = /* wgsl */`
struct PaletteGrade {
    row0: vec4f,
    row1: vec4f,
    row2: vec4f,
    alpha: f32
}

fn paletteGrade(index: u32) -> PaletteGrade {
    if (index == 0u) {
        return PaletteGrade(
            vec4f(1.0, 0.0, 0.0, 0.0), vec4f(0.0, 1.0, 0.0, 0.0), vec4f(0.0, 0.0, 1.0, 0.0), 1.0
        );
    }
    let x = i32(index % ${COLOR_PALETTE_ENTRIES_PER_ROW}u) * 4;
    let y = i32(index / ${COLOR_PALETTE_ENTRIES_PER_ROW}u);
    return PaletteGrade(
        textureLoad(colorPalette, vec2i(x, y), 0),
        textureLoad(colorPalette, vec2i(x + 1, y), 0),
        textureLoad(colorPalette, vec2i(x + 2, y), 0),
        textureLoad(colorPalette, vec2i(x + 3, y), 0).x
    );
}`;

export { applyColorGradeWGSL, paletteGradeWGSL, COLOR_PALETTE_ENTRIES_PER_ROW };
