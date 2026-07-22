const vertexShader = /* wgsl */`
#include "gsplatOutputVS"

attribute vertex_position: vec3f;

#ifndef STOCHASTIC
var<storage, read> sortedIndices: array<u32>;
#endif
var cacheA: texture_2d<u32>;
var cacheB: texture_2d<u32>;

uniform cacheWidth: u32;
uniform numProjectedSplats: u32;
uniform viewportSize: vec4f;
uniform clipZParams: vec4f;
uniform pickBase: u32;
uniform pickCount: u32;
uniform pickOp: i32;

varying gaussianUV: vec2f;
varying gaussianColor: vec4f;
varying @interpolate(flat) gaussianFlags: u32;
varying @interpolate(flat) gaussianId: u32;
varying gaussianDepth: f32;

const discardPosition = vec4f(0.0, 0.0, 2.0, 1.0);

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    let order = pcInstanceIndex * 128u + u32(vertex_position.z);
    if (order >= uniform.numProjectedSplats) {
        output.position = discardPosition;
        return output;
    }

    // stochastic mode skips the sort, so the draw reads cache entries in identity
    // order; the sorted path indexes through the globally-sorted index buffer
    #ifdef STOCHASTIC
        let entry = order;
    #else
        let entry = sortedIndices[order];
    #endif
    #ifdef PICK_PASS
        if (entry < uniform.pickBase || entry >= uniform.pickBase + uniform.pickCount) {
            output.position = discardPosition;
            return output;
        }
    #endif
    let uv = vec2i(i32(entry % uniform.cacheWidth), i32(entry / uniform.cacheWidth));
    let a = textureLoad(cacheA, uv, 0);
    let b = textureLoad(cacheB, uv, 0).x;

    let alpha = f32((b >> 16u) & 0xffu) / 255.0;
    if (alpha == 0.0) {
        output.position = discardPosition;
        return output;
    }
    let flags = (b >> 24u) & 3u;
    #ifdef PICK_PASS
        if ((uniform.pickOp == 0 && flags != 0u)
            || (uniform.pickOp == 1 && flags != 1u)
            || (uniform.pickOp == 2 && (flags & 2u) != 0u)) {
            output.position = discardPosition;
            return output;
        }
    #endif

    // reconstruct clip position: ndc from snorm16 over the projector's range,
    // w = view depth (1 for ortho), z affine in view depth via clipZParams.xy
    let maxRadius = min(1024.0, min(uniform.viewportSize.x, uniform.viewportSize.y));
    let ndcRange = vec2f(1.0) + vec2f(8.0 * maxRadius) / uniform.viewportSize.xy;
    let ndc = unpack2x16snorm(a.x) * ndcRange;
    let depth = bitcast<f32>(a.y);
    let w = select(depth, 1.0, uniform.clipZParams.z != 0.0);
    let clip = vec4f(ndc * w, clamp(uniform.clipZParams.x * depth + uniform.clipZParams.y, 0.0, w), w);

    let rgbBits = a.z;
    let color = vec3f(vec3u(rgbBits, rgbBits >> 10u, rgbBits >> 20u) & vec3u(1023u))
        * (f32(1u << (rgbBits >> 30u)) / 1023.0);

    let axis1 = unpack2x16float(a.w);
    let axis2 = unpack2x16float(b).x * normalize(vec2f(axis1.y, -axis1.x));

    let corner = vertex_position.xy;
    let pixelOffset = corner.x * axis1 + corner.y * axis2;
    let clipOffset = pixelOffset * clip.w * uniform.viewportSize.zw;
    output.position = clip + vec4f(clipOffset, 0.0, 0.0);
    output.gaussianUV = corner;
    output.gaussianColor = vec4f(prepareOutputFromGamma(color, clip.w), alpha);
    output.gaussianFlags = flags;
    output.gaussianId = entry - uniform.pickBase;
    output.gaussianDepth = clip.w;
    return output;
}
`;

const fragmentShader = /* wgsl */`
varying gaussianUV: vec2f;
varying gaussianColor: vec4f;
varying @interpolate(flat) gaussianFlags: u32;
varying @interpolate(flat) gaussianId: u32;
varying gaussianDepth: f32;

uniform outlineMode: u32;
uniform ringSize: f32;
uniform ringsBase: u32;
uniform ringsCount: u32;
uniform pickMode: i32;
uniform cameraParams: vec4f;

const EXP4 = exp(-4.0);
const INV_EXP4 = 1.0 / (1.0 - EXP4);

fn normExp(x: f32) -> f32 {
    return (exp(x * -4.0) - EXP4) * INV_EXP4;
}

// integer hash (Chris Wellons' "prospector" mix) → uniform u32, used for the
// per-(pixel, splat) stochastic-transparency coverage decision
fn hashU32(x: u32) -> u32 {
    var v = x;
    v ^= v >> 16u;
    v *= 0x7feb352du;
    v ^= v >> 15u;
    v *= 0x846ca68bu;
    v ^= v >> 16u;
    return v;
}

@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
    var output: FragmentOutput;
    let radius = dot(gaussianUV, gaussianUV);
    if (radius > 1.0) {
        discard;
    }

    #ifdef PICK_PASS
        if (uniform.pickMode == 1) {
            let depth = (gaussianDepth - uniform.cameraParams.z) / (uniform.cameraParams.y - uniform.cameraParams.z);
            let contribution = normExp(radius) * gaussianColor.a;
            if (contribution < 1.0 / 255.0) {
                discard;
            }
            let alpha = gaussianColor.a;
            output.color = vec4f(depth * alpha, 0.0, 0.0, alpha);
        } else {
            let id = gaussianId;
            output.color = vec4f(vec4u(id, id >> 8u, id >> 16u, id >> 24u) & vec4u(255u)) / 255.0;
        }
    #else
      #ifdef STOCHASTIC
        // 1 spp stochastic transparency: keep this fragment with probability
        // alpha and write it opaque; the hardware depth test then resolves
        // visibility, so no sorting is needed. Hashing per (pixel, splat) makes
        // overlapping gaussians take independent coverage decisions.
        // 1 spp stochastic transparency: keep this fragment with probability
        // alpha and write it opaque; the hardware depth test then resolves
        // visibility, so no sorting is needed. gaussianUV varies per fragment
        // across the quad and differs between overlapping splats, so hashing it
        // (with the splat id) gives independent per-pixel coverage decisions
        // without needing a screen-position varying.
        let norm = normExp(radius);
        let alpha = norm * gaussianColor.a;
        let q = vec2u(vec2i((gaussianUV * 0.5 + 0.5) * 4095.0));
        // WGSL requires parentheses when mixing bitwise (^) with arithmetic (*)
        let rnd = f32(hashU32((q.x * 1973u) ^ (q.y * 9277u) ^ ((gaussianId + 1u) * 26699u))) * (1.0 / 4294967295.0);
        if (rnd >= alpha) {
            discard;
        }
        output.color = vec4f(gaussianColor.rgb, 1.0);
        output.color1 = vec4f(0.0);
      #else
        let selected = (gaussianFlags & 1u) != 0u;
        let locked = (gaussianFlags & 2u) != 0u;
        let norm = normExp(radius);
        var alpha = norm * gaussianColor.a;
        // rings apply only to the selected splat's gaussians (gaussianId is the
        // cache entry index in the forward pass, where pickBase is 0)
        let rings = gaussianId >= uniform.ringsBase && gaussianId < uniform.ringsBase + uniform.ringsCount;
        if (!locked && rings && uniform.ringSize > 0.0) {
            alpha = select(0.6, max(0.05, alpha), radius < 1.0 - uniform.ringSize);
        }
        if (uniform.outlineMode != 0u) {
            output.color = vec4f(gaussianColor.rgb * alpha, alpha);
            output.color1 = vec4f(0.0, 0.0, 0.0, select(0.0, norm, selected));
        } else if (selected) {
            output.color = vec4f(gaussianColor.rgb * alpha * 0.8, alpha);
            output.color1 = vec4f(gaussianColor.rgb * alpha * 0.2, alpha);
        } else {
            output.color = vec4f(gaussianColor.rgb * alpha, alpha);
            output.color1 = vec4f(0.0);
        }
      #endif
    #endif
    return output;
}
`;

export { vertexShader, fragmentShader };
