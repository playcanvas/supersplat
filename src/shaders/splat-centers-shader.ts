import { compactTailWGSL, overlayEligibleWGSL } from './projected-splat-chunk';

// Splat centres overlay, drawn from the projector's output: one quad per
// projected splat of the selected layer, over the compact list - survivors from
// the front, culled splats from the tail - with the gaussian renderer's
// indirect draw args. Reading the cached screen position instead of transforming
// the source means no matrix or SH work per vertex, and no work at all for
// splats the projector culled
const vertexShader = /* wgsl */ `
attribute vertex_position: vec3f;

var<storage, read> compactEntries: array<u32>;
var<storage, read> splatCount: array<u32>;
// one bit per cache entry: the gaussians a visible-surface drag could select
// from this camera (the visibility pass, see ProjectedSplatRenderer)
var<storage, read> visible: array<u32>;
var cacheA: texture_2d<u32>;
var cacheB: texture_2d<u32>;

uniform cacheWidth: u32;
uniform capacity: u32;
uniform viewportSize: vec4f;
uniform clipZParams: vec4f;
uniform centersBase: u32;
uniform centersCount: u32;
uniform centerSize: f32;
uniform drawMask: u32;
// x-ray off: an unselected centre draws only if its gaussian is selectable
uniform visibleOnly: u32;
uniform colorBlend: f32;
uniform selectedClr: vec4f;
uniform unselectedClr: vec4f;

varying @interpolate(flat, either) overlayColor: vec4f;

${overlayEligibleWGSL}
${compactTailWGSL}

const discardPosition = vec4f(0.0, 0.0, 2.0, 1.0);

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    let order = pcInstanceIndex * 128u + u32(vertex_position.z);
    let survivors = splatCount[0];
    if (order >= survivors + splatCount[1]) {
        output.position = discardPosition;
        return output;
    }
    // survivors fill the compact list from the front, culled splats the tail
    // from the back; the depth test resolves overlap, so neither needs sorting
    var entry: u32;
    if (order < survivors) {
        entry = compactEntries[order];
    } else {
        entry = compactEntries[compactTailSlot(order - survivors, uniform.capacity)];
    }
    // only the selected layer draws centres
    if (entry < uniform.centersBase || entry >= uniform.centersBase + uniform.centersCount) {
        output.position = discardPosition;
        return output;
    }

    let uv = vec2i(i32(entry % uniform.cacheWidth), i32(entry / uniform.cacheWidth));
    let flags = (textureLoad(cacheB, uv, 0).x >> 24u) & 3u;
    if (!overlayEligible(flags, uniform.drawMask)) {
        output.position = discardPosition;
        return output;
    }
    // selected centres always draw: they show what is selected, not what could be
    if (uniform.visibleOnly != 0u && (flags & 1u) == 0u && (visible[entry >> 5u] & (1u << (entry & 31u))) == 0u) {
        output.position = discardPosition;
        return output;
    }
    let a = textureLoad(cacheA, uv, 0);

    // clip position reconstructed exactly as the gaussian renderer does, so the
    // centre sits on its gaussian and carries the same depth
    let maxRadius = min(1024.0, min(uniform.viewportSize.x, uniform.viewportSize.y));
    let ndcRange = vec2f(1.0) + vec2f(4.0 * maxRadius) / uniform.viewportSize.xy;
    let ndc = unpack2x16snorm(a.x) * ndcRange;
    let depth = bitcast<f32>(a.y);
    let w = select(depth, 1.0, uniform.clipZParams.z != 0.0);
    let clip = vec4f(ndc * w, clamp(uniform.clipZParams.x * depth + uniform.clipZParams.y, 0.0, w), w);
    // a centerSize-pixel square
    let clipOffset = vertex_position.xy * (0.5 * uniform.centerSize) * w * uniform.viewportSize.zw;
    output.position = clip + vec4f(clipOffset, 0.0, 0.0);

    // an unselected centre blends from the gaussian's own colour (as cached,
    // so graded) toward the flat unselected colour by colorBlend; a selected
    // one takes the selection colour
    let rgbBits = a.z;
    let color = vec3f(vec3u(rgbBits, rgbBits >> 10u, rgbBits >> 20u) & vec3u(1023u))
        * (f32(1u << (rgbBits >> 30u)) / 1023.0);
    let selected = (flags & 1u) != 0u;
    let tint = select(uniform.unselectedClr.rgb, uniform.selectedClr.rgb, selected);
    let blend = select(uniform.colorBlend, 1.0, selected);
    output.overlayColor = vec4f(mix(color, tint, blend), 1.0);
    return output;
}
`;

const fragmentShader = /* wgsl */ `
varying @interpolate(flat, either) overlayColor: vec4f;

@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
    var output: FragmentOutput;
    output.color = input.overlayColor;
    return output;
}
`;

export { vertexShader, fragmentShader };
