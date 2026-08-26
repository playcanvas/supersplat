// transform palette entries per texture row (each entry occupies 3 texels).
// shared with TransformPalette, which sizes the texture from it
const PALETTE_ENTRIES_PER_ROW = 512;

// per-gaussian transform palette lookup. requires a `transformPalette:
// texture_2d<f32>` binding in scope; entry 0 is the identity matrix
const paletteMatrixWGSL = /* wgsl */`
fn paletteMatrix(index: u32) -> mat4x4f {
    if (index == 0u) {
        return mat4x4f(
            vec4f(1.0, 0.0, 0.0, 0.0), vec4f(0.0, 1.0, 0.0, 0.0),
            vec4f(0.0, 0.0, 1.0, 0.0), vec4f(0.0, 0.0, 0.0, 1.0)
        );
    }
    let x = i32(index % ${PALETTE_ENTRIES_PER_ROW}u) * 3;
    let y = i32(index / ${PALETTE_ENTRIES_PER_ROW}u);
    let r0 = textureLoad(transformPalette, vec2i(x, y), 0);
    let r1 = textureLoad(transformPalette, vec2i(x + 1, y), 0);
    let r2 = textureLoad(transformPalette, vec2i(x + 2, y), 0);
    return mat4x4f(
        vec4f(r0.x, r1.x, r2.x, 0.0), vec4f(r0.y, r1.y, r2.y, 0.0),
        vec4f(r0.z, r1.z, r2.z, 0.0), vec4f(r0.w, r1.w, r2.w, 1.0)
    );
}`;

// index -> texel coordinate in a row-major texture. the width expression is
// caller-supplied because the uniform it lives in differs per shader
const indexToUvWGSL = (name: string, width: string) => /* wgsl */`
fn ${name}(index: u32) -> vec2i {
    return vec2i(i32(index % ${width}), i32(index / ${width}));
}`;

export { PALETTE_ENTRIES_PER_ROW, paletteMatrixWGSL, indexToUvWGSL };
