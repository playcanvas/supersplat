// Through-mode footprint selection: one thread per projected survivor tests its
// screen-space ellipse (the same |u| <= 1 footprint the render and pick shaders
// rasterize) against the gesture region, expressed as per-row x-intervals in
// render-target pixels. Exact to mask resolution - no depth test, so it selects
// through all layers, and reading the compact list means it covers exactly the
// splats the frame projected (including zero-alpha ones, which stay projected).

// words per region row: interval count + INTERVALS_PER_ROW (x0, x1) pairs
const INTERVALS_PER_ROW = 8;
const ROW_STRIDE = 1 + INTERVALS_PER_ROW * 2;

const footprintIntersect = /* wgsl */`
struct Uniforms {
    cacheWidth: u32,
    viewport: vec2f,
    entryBase: u32,
    entryCount: u32,
    regionY0: i32,
    regionY1: i32,
    footprint: f32,
    outputWords: u32
}

@group(0) @binding(0) var<storage, read_write> result: array<atomic<u32>>;
@group(0) @binding(1) var<storage, read> compactEntries: array<u32>;
@group(0) @binding(2) var<storage, read> splatCounter: array<u32>;
@group(0) @binding(3) var<storage, read> intervals: array<u32>;
@group(0) @binding(4) var cacheA: texture_2d<u32>;
@group(0) @binding(5) var cacheB: texture_2d<u32>;
@group(0) @binding(6) var<uniform> uniforms: Uniforms;

const ROW_STRIDE = ${ROW_STRIDE}u;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3u) {
    let idx = gid.x;
    if (idx >= splatCounter[0]) {
        return;
    }
    let entry = compactEntries[idx];
    if (entry < uniforms.entryBase || entry >= uniforms.entryBase + uniforms.entryCount) {
        return;
    }

    let uv = vec2i(i32(entry % uniforms.cacheWidth), i32(entry / uniforms.cacheWidth));
    let a = textureLoad(cacheA, uv, 0);

    // decode the projected ellipse exactly as the render shader does
    let maxRadius = min(1024.0, min(uniforms.viewport.x, uniforms.viewport.y));
    let ndcRange = vec2f(1.0) + vec2f(8.0 * maxRadius) / uniforms.viewport;
    let ndc = unpack2x16snorm(a.x) * ndcRange;
    // ndc y is up, target rows run down
    let center = (vec2f(ndc.x, -ndc.y) * 0.5 + 0.5) * uniforms.viewport;

    var axis1 = unpack2x16float(a.w);
    let len2 = unpack2x16float(textureLoad(cacheB, uv, 0).x).x;
    var axis2 = len2 * normalize(vec2f(axis1.y, -axis1.x));

    // footprint scale, each axis clamped to ~a pixel so small footprints stay
    // selectable (matching the pick pass's clamp)
    axis1 *= max(uniforms.footprint, 1.0 / max(length(axis1), 1e-6));
    axis2 *= max(uniforms.footprint, 1.0 / max(length(axis2), 1e-6));
    // axis y points up in ndc-derived pixel space; rows run down
    axis1.y = -axis1.y;
    axis2.y = -axis2.y;

    // conic of the ellipse |A^-1 (p - c)| <= 1: q11 dx^2 + 2 q12 dx dy + q22 dy^2 <= 1
    let det = axis1.x * axis2.y - axis2.x * axis1.y;
    if (abs(det) < 1e-6) {
        return;
    }
    let inv = 1.0 / det;
    // M = A^-1 rows
    let m0 = vec2f(axis2.y, -axis2.x) * inv;
    let m1 = vec2f(-axis1.y, axis1.x) * inv;
    let q11 = m0.x * m0.x + m1.x * m1.x;
    let q12 = m0.x * m0.y + m1.x * m1.y;
    let q22 = m0.y * m0.y + m1.y * m1.y;

    let extentY = abs(axis1.y) + abs(axis2.y);
    let yMin = max(i32(floor(center.y - extentY)), uniforms.regionY0);
    let yMax = min(i32(ceil(center.y + extentY)), uniforms.regionY1);

    for (var y = yMin; y <= yMax; y++) {
        let dy = f32(y) + 0.5 - center.y;
        // x-extent of the ellipse at this row
        let disc = q12 * q12 * dy * dy - q11 * (q22 * dy * dy - 1.0);
        if (disc < 0.0) {
            continue;
        }
        let sq = sqrt(disc);
        let x0 = center.x + (-q12 * dy - sq) / q11;
        let x1 = center.x + (-q12 * dy + sq) / q11;

        let rowBase = u32(y - uniforms.regionY0) * ROW_STRIDE;
        let count = intervals[rowBase];
        for (var k = 0u; k < count; k++) {
            let ix0 = f32(intervals[rowBase + 1u + k * 2u]);
            let ix1 = f32(intervals[rowBase + 2u + k * 2u]);
            if (x1 >= ix0 && x0 <= ix1) {
                let instance = entry - uniforms.entryBase;
                let word = instance >> 2u;
                if (word < uniforms.outputWords) {
                    atomicOr(&result[word], 0xffu << ((instance & 3u) * 8u));
                }
                return;
            }
        }
    }
}`;

export { footprintIntersect, INTERVALS_PER_ROW, ROW_STRIDE };
