// Splat centres overlay, drawn from the projector's output: one quad per
// projected splat of the selected layer, over the compact list - survivors from
// the front, size-culled splats from the tail - with the gaussian renderer's
// indirect draw args. Reading the cached screen position instead of transforming
// the source means no matrix or SH work per vertex, and no work at all for
// splats the projector culled
const vertexShader = /* wgsl */`
attribute vertex_position: vec3f;

var<storage, read> compactEntries: array<u32>;
var<storage, read> splatCount: array<u32>;
var cacheA: texture_2d<u32>;
var cacheB: texture_2d<u32>;

uniform cacheWidth: u32;
uniform capacity: u32;
uniform viewportSize: vec4f;
uniform clipZParams: vec4f;
uniform centersBase: u32;
uniform centersCount: u32;
uniform centerSize: f32;
uniform selectionOnly: u32;
uniform selectionCenters: u32;
uniform colorBlend: f32;
uniform selectionBlend: f32;
uniform selectedClr: vec4f;
uniform unselectedClr: vec4f;

varying @interpolate(flat) overlayColor: vec4f;

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
    // survivors fill the compact list from the front, size-culled splats from
    // the back; the depth test resolves overlap, so neither needs sorting
    var entry: u32;
    if (order < survivors) {
        entry = compactEntries[order];
    } else {
        entry = compactEntries[uniform.capacity - 1u - (order - survivors)];
    }
    // only the selected layer draws centres
    if (entry < uniform.centersBase || entry >= uniform.centersBase + uniform.centersCount) {
        output.position = discardPosition;
        return output;
    }

    let uv = vec2i(i32(entry % uniform.cacheWidth), i32(entry / uniform.cacheWidth));
    let flags = (textureLoad(cacheB, uv, 0).x >> 24u) & 3u;
    if ((flags & 2u) != 0u || (uniform.selectionOnly != 0u && (flags & 1u) == 0u)) {
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

    // colorBlend mixes the base from the gaussian's own colour (as cached, so
    // graded) toward the flat unselected colour; selectionBlend takes a selected
    // centre from there toward the selection colour
    let rgbBits = a.z;
    let color = vec3f(vec3u(rgbBits, rgbBits >> 10u, rgbBits >> 20u) & vec3u(1023u))
        * (f32(1u << (rgbBits >> 30u)) / 1023.0);
    let base = mix(color, uniform.unselectedClr.rgb, uniform.colorBlend);
    let selected = select(0.0, uniform.selectionBlend, (flags & 1u) != 0u && uniform.selectionCenters != 0u);
    output.overlayColor = vec4f(mix(base, uniform.selectedClr.rgb, selected), 1.0);
    return output;
}
`;

const fragmentShader = /* wgsl */`
varying @interpolate(flat) overlayColor: vec4f;

@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
    var output: FragmentOutput;
    output.color = input.overlayColor;
    return output;
}
`;

export { vertexShader, fragmentShader };
