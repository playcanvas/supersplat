const vertexShader = /* wgsl */`
#include "gsplatOutputVS"

attribute vertex_position: vec3f;

#ifndef STOCHASTIC
var<storage, read> sortedIndices: array<u32>;
#endif
// dense list of surviving entries and their count, both written by the projector.
// The draw is indirect over the count, so the cpu never knows it
var<storage, read> compactEntries: array<u32>;
var<storage, read> splatCount: array<u32>;
var cacheA: texture_2d<u32>;
var cacheB: texture_2d<u32>;

uniform cacheWidth: u32;
uniform viewportSize: vec4f;
uniform clipZParams: vec4f;
uniform pickBase: u32;
uniform pickCount: u32;
uniform pickOp: i32;
uniform pickFootprint: f32;
uniform ringColor: vec4f;
uniform selectedRingColor: vec4f;
uniform unselectedColor: vec4f;
uniform selectedColor: vec4f;
uniform ringSize: f32;
uniform ringSelectionOnly: u32;
uniform ringsBase: u32;
uniform ringsCount: u32;
uniform outlineMode: u32;
uniform showGaussians: u32;
uniform showSelectedGaussians: u32;

varying gaussianUV: vec2f;
varying gaussianColor: vec4f;
varying ringColor: vec4f;
varying selectedRingColor: vec4f;
varying @interpolate(flat) gaussianFlags: u32;
varying @interpolate(flat) gaussianId: u32;
varying gaussianDepth: f32;

const discardPosition = vec4f(0.0, 0.0, 2.0, 1.0);

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    let order = pcInstanceIndex * 128u + u32(vertex_position.z);
    // the indirect instance count is rounded up to whole 128-quad instances, so
    // the tail of the last one has to be discarded here
    if (order >= splatCount[0]) {
        output.position = discardPosition;
        return output;
    }

    // both paths resolve to a cache entry index: stochastic reads the compact
    // list directly (it needs no ordering), the sorted path reads it through the
    // sort, which carries the same entry indices as its payload
    #ifdef STOCHASTIC
        let entry = compactEntries[order];
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
    let flags = (b >> 24u) & 3u;
    // a zero-alpha splat is invisible to the gaussian pass but is still a real,
    // editable splat: keep its quad wherever rings mode would draw its ring band
    // (mirroring the fragment shader's eligibility test) so it renders and picks
    // there. Everywhere else skip it as before, so an invisible splat can't
    // steal frontmost picks or burn fill
    let ringEligible = uniform.ringSize > 0.0 && (flags & 2u) == 0u
        && entry >= uniform.ringsBase && entry < uniform.ringsBase + uniform.ringsCount
        && (uniform.ringSelectionOnly == 0u || (flags & 1u) != 0u);
    if (alpha == 0.0 && !ringEligible) {
        output.position = discardPosition;
        return output;
    }
    #ifndef PICK_PASS
        // with gaussian display off (e.g. a centers-only view), quads whose
        // fragments could not contribute anything skip rasterization entirely
        // instead of blending transparent pixels - only ring bands, the
        // selected-gaussian display and the selection outline still need them
        if (uniform.showGaussians == 0u && !ringEligible
            && !((flags & 1u) != 0u && (uniform.showSelectedGaussians != 0u || uniform.outlineMode != 0u))) {
            output.position = discardPosition;
            return output;
        }
    #endif
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
    // the splat's own colour: the cache rgb carries no selection tint, so the
    // gaussian and ring blends below each start from it independently. The
    // tint alphas are blend weights; they only apply inside the selection
    // entry range (the edit target with overlays enabled)
    let color = vec3f(vec3u(rgbBits, rgbBits >> 10u, rgbBits >> 20u) & vec3u(1023u))
        * (f32(1u << (rgbBits >> 30u)) / 1023.0);
    var gaussianRgb = color;
    if (entry >= uniform.ringsBase && entry < uniform.ringsBase + uniform.ringsCount && (flags & 2u) == 0u) {
        gaussianRgb = mix(gaussianRgb, uniform.unselectedColor.rgb, uniform.unselectedColor.a);
        if ((flags & 1u) != 0u) {
            gaussianRgb = mix(gaussianRgb, uniform.selectedColor.rgb, uniform.selectedColor.a);
        }
    }
    // ring band colours, resolved here from the untinted base: gaussian colour
    // -> flat unselected colour -> selection colour
    let ringRgb = mix(color, uniform.ringColor.rgb, uniform.ringColor.a);
    let selectedRingRgb = mix(ringRgb, uniform.selectedRingColor.rgb, uniform.selectedRingColor.a);

    var axis1 = unpack2x16float(a.w);
    var axis2 = unpack2x16float(b).x * normalize(vec2f(axis1.y, -axis1.x));
    #ifdef PICK_PASS
        // id picks select by the footprint slider: scale each axis, clamped so
        // the quad still covers ~a pixel at 0 (centers semantics). Depth picks
        // pass 1 so surface estimation always sees the true footprint
        axis1 *= max(uniform.pickFootprint, 1.0 / max(length(axis1), 1e-6));
        axis2 *= max(uniform.pickFootprint, 1.0 / max(length(axis2), 1e-6));
    #endif

    let corner = vertex_position.xy;
    let pixelOffset = corner.x * axis1 + corner.y * axis2;
    let clipOffset = pixelOffset * clip.w * uniform.viewportSize.zw;
    output.position = clip + vec4f(clipOffset, 0.0, 0.0);
    output.gaussianUV = corner;
    output.gaussianColor = vec4f(prepareOutputFromGamma(gaussianRgb, clip.w), alpha);
    output.ringColor = vec4f(prepareOutputFromGamma(ringRgb, clip.w), 1.0);
    output.selectedRingColor = vec4f(prepareOutputFromGamma(selectedRingRgb, clip.w), 1.0);
    output.gaussianFlags = flags;
    output.gaussianId = entry - uniform.pickBase;
    output.gaussianDepth = clip.w;
    return output;
}
`;

const fragmentShader = /* wgsl */`
varying gaussianUV: vec2f;
varying gaussianColor: vec4f;
varying ringColor: vec4f;
varying selectedRingColor: vec4f;
varying @interpolate(flat) gaussianFlags: u32;
varying @interpolate(flat) gaussianId: u32;
varying gaussianDepth: f32;

uniform outlineMode: u32;
uniform showGaussians: u32;
uniform showSelectedGaussians: u32;
uniform ringSize: f32;
uniform ringSelectionOnly: u32;
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
        let selected = (gaussianFlags & 1u) != 0u;
        let locked = (gaussianFlags & 2u) != 0u;
        let norm = normExp(radius);
        let showGaussian = uniform.showGaussians != 0u || (selected && uniform.showSelectedGaussians != 0u);
        var alpha = select(0.0, norm * gaussianColor.a, showGaussian);
        var color = gaussianColor.rgb;
        // Rings apply only to the selected splat's gaussians (gaussianId is the
        // cache entry index in the forward pass, where pickBase is 0). Their
        // alpha is composed with the independently-controlled gaussian fill.
        let rings = gaussianId >= uniform.ringsBase && gaussianId < uniform.ringsBase + uniform.ringsCount;
        if (!locked && rings && uniform.ringSize > 0.0 && (uniform.ringSelectionOnly == 0u || selected)) {
            let ringBand = radius >= 1.0 - uniform.ringSize;
            if (ringBand) {
                alpha = 0.6;
                // ring colours arrive fully resolved from the vertex stage,
                // blended from the splat's own colour so they stay independent
                // of the gaussian tints
                color = select(ringColor.rgb, selectedRingColor.rgb, selected);
            } else {
                // rings mode shades the whole gaussian: the interior keeps its
                // fill but never drops below a faint floor, so even invisible
                // splats read as discs inside their rings. Skipped in stochastic
                // mode, where a floor would dither every footprint with noise
                #ifndef STOCHASTIC
                    alpha = max(0.05, alpha);
                #endif
            }
        }
      #ifdef STOCHASTIC
        // 1 spp stochastic transparency (StochasticSplats, Listing 1): keep this
        // fragment with raw probability alpha, write it opaque; the depth test
        // resolves visibility, so no sorting. Coverage thresholds are stratified
        // across each screen-space 2x2 quad — the quad's four pixels take the
        // four strata of [0,1) in a per-(quad, splat) scrambled order with a
        // shared jitter — so a splat with alpha a covers 4a±1 of the quad. The
        // final blit averages each quad and bilinearly interpolates between quad
        // centres, replacing most of the sampling noise with quantization error.
        // Hashing quad +
        // splat id keeps overlapping splats decorrelated and each pixel's
        // threshold marginally uniform. The settle still renders the exact
        // sorted blend.
        let pix = vec2u(pcPosition.xy);
        let quad = pix >> vec2u(1u);
        // WGSL requires parentheses when mixing bitwise (^) with arithmetic (*)
        let h = hashU32((quad.x * 1973u) ^ (quad.y * 9277u) ^ ((gaussianId + 1u) * 26699u));
        let stratum = ((pix.y & 1u) * 2u + (pix.x & 1u)) ^ (h & 3u);
        let rnd = (f32(stratum) + f32(h >> 8u) * (1.0 / 16777216.0)) * 0.25;
        if (rnd >= alpha) {
            discard;
        }
        // alpha 2 tags this pixel as a stochastic sample for the resolve. The
        // target is RGBA16F so it survives unclamped, and nothing else drawn into
        // it can exceed 1, which lets the blit composite splats against the rest
        // of the frame instead of blurring all of it. Never exported: captures set
        // lockedRenderMode, which forces the sorted path.
        output.color = vec4f(color, 2.0);
        output.color1 = vec4f(0.0);
      #else
        if (uniform.outlineMode != 0u) {
            output.color = vec4f(color * alpha, alpha);
            output.color1 = vec4f(0.0, 0.0, 0.0, select(0.0, norm, selected));
        } else if (selected) {
            output.color = vec4f(color * alpha * 0.8, alpha);
            output.color1 = vec4f(color * alpha * 0.2, alpha);
        } else {
            output.color = vec4f(color * alpha, alpha);
            output.color1 = vec4f(0.0);
        }
      #endif
    #endif
    return output;
}
`;

export { vertexShader, fragmentShader };
