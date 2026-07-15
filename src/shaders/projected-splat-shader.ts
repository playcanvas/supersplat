const vertexShader = /* wgsl */`
#include "gsplatOutputVS"

attribute vertex_position: vec3f;

var<storage, read> sortedIndices: array<u32>;
var cacheA: texture_2d<u32>;
var cacheB: texture_2d<u32>;

uniform cacheWidth: u32;
uniform numProjectedSplats: u32;
uniform viewportSize: vec4f;
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

    let entry = sortedIndices[order];
    #ifdef PICK_PASS
        if (entry < uniform.pickBase || entry >= uniform.pickBase + uniform.pickCount) {
            output.position = discardPosition;
            return output;
        }
    #endif
    let uv = vec2i(i32(entry % uniform.cacheWidth), i32(entry / uniform.cacheWidth));
    let a = textureLoad(cacheA, uv, 0);
    let b = textureLoad(cacheB, uv, 0);
    let clip = bitcast<vec4f>(a);
    let axis1 = unpack2x16float(b.x);
    let axis2 = unpack2x16float(b.y);
    let rg = unpack2x16float(b.z);
    let ba = unpack2x16float(b.w);
    let flags = select(0u, 1u, (b.w & 0x80000000u) != 0u)
        | select(0u, 2u, (b.w & 0x00008000u) != 0u);
    #ifdef PICK_PASS
        if ((uniform.pickOp == 0 && flags != 0u)
            || (uniform.pickOp == 1 && flags != 1u)
            || (uniform.pickOp == 2 && (flags & 2u) != 0u)) {
            output.position = discardPosition;
            return output;
        }
    #endif
    let color = vec4f(rg, abs(ba.x), abs(ba.y));
    if (color.a == 0.0) {
        output.position = discardPosition;
        return output;
    }

    let corner = vertex_position.xy;
    let pixelOffset = corner.x * axis1 + corner.y * axis2;
    let clipOffset = pixelOffset * clip.w * uniform.viewportSize.zw;
    output.position = clip + vec4f(clipOffset, 0.0, 0.0);
    output.gaussianUV = corner;
    output.gaussianColor = vec4f(prepareOutputFromGamma(color.rgb, clip.w), color.a);
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
uniform pickMode: i32;
uniform cameraParams: vec4f;

const EXP4 = exp(-4.0);
const INV_EXP4 = 1.0 / (1.0 - EXP4);

fn normExp(x: f32) -> f32 {
    return (exp(x * -4.0) - EXP4) * INV_EXP4;
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
            let alpha = normExp(radius);
            output.color = vec4f(depth * alpha, 0.0, 0.0, alpha);
        } else {
            let id = gaussianId;
            output.color = vec4f(vec4u(id, id >> 8u, id >> 16u, id >> 24u) & vec4u(255u)) / 255.0;
        }
    #else
        let selected = (gaussianFlags & 1u) != 0u;
        let locked = (gaussianFlags & 2u) != 0u;
        let norm = normExp(radius);
        var alpha = norm * gaussianColor.a;
        if (!locked && uniform.ringSize > 0.0) {
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
    return output;
}
`;

export { vertexShader, fragmentShader };
