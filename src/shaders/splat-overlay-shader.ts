import { indexToUvWGSL, paletteMatrixWGSL } from './palette-chunk';

const vertexShader = /* wgsl */`
attribute vertex_position: vec2f;

uniform matrix_model: mat4x4f;
uniform matrix_viewProjection: mat4x4f;
uniform view_position: vec3f;
uniform texParams: vec2u;
uniform instanceBase: u32;
uniform splatSize: f32;
uniform viewportSize: vec2f;
uniform useGaussianColor: f32;
uniform selectionOnly: u32;
uniform selectedClr: vec4f;
uniform unselectedClr: vec4f;

var<storage, read> instanceSource: array<u32>;
var<storage, read> instanceFlags: array<u32>;
var<storage, read> instancePalette: array<u32>;
var splatPosition: texture_2d<u32>;
var transformPalette: texture_2d<f32>;
var splatColor: texture_2d<f32>;

#if SH_BANDS > 0
var splatSH_1to3: texture_2d<u32>;
#if SH_BANDS > 1
var splatSH_4to7: texture_2d<u32>;
var splatSH_8to11: texture_2d<u32>;
#if SH_BANDS > 2
var splatSH_12to15: texture_2d<u32>;
#endif
#endif
#endif

varying overlayColor: vec4f;

${indexToUvWGSL('splatUv', 'uniform.texParams.x')}
${paletteMatrixWGSL}

fn instanceFlagByte(instance: u32) -> u32 {
    return (instanceFlags[instance >> 2u] >> ((instance & 3u) * 8u)) & 0xffu;
}

#if SH_BANDS > 0
fn unpack111011s(bits: u32) -> vec3f {
    let value = vec3u((vec3u(bits) >> vec3u(21u, 11u, 0u)) & vec3u(0x7ffu, 0x3ffu, 0x7ffu));
    return vec3f(value) / vec3f(2047.0, 1023.0, 2047.0) * 2.0 - 1.0;
}

fn evaluateSH(uv: vec2i, direction: vec3f) -> vec3f {
    var coefficients: array<vec3f, 15>;
    let first = textureLoad(splatSH_1to3, uv, 0);
    let scale = bitcast<f32>(first.x);
    coefficients[0] = unpack111011s(first.y);
    coefficients[1] = unpack111011s(first.z);
    coefficients[2] = unpack111011s(first.w);
    var result = 0.4886025119029199 * (
        -coefficients[0] * direction.y
        + coefficients[1] * direction.z
        - coefficients[2] * direction.x
    );
    #if SH_BANDS > 1
        let second = textureLoad(splatSH_4to7, uv, 0);
        coefficients[3] = unpack111011s(second.x);
        coefficients[4] = unpack111011s(second.y);
        coefficients[5] = unpack111011s(second.z);
        coefficients[6] = unpack111011s(second.w);
        coefficients[7] = unpack111011s(textureLoad(splatSH_8to11, uv, 0).x);
        let xx = direction.x * direction.x;
        let yy = direction.y * direction.y;
        let zz = direction.z * direction.z;
        let xy = direction.x * direction.y;
        let yz = direction.y * direction.z;
        let xz = direction.x * direction.z;
        result += coefficients[3] * (1.0925484305920792 * xy)
            + coefficients[4] * (-1.0925484305920792 * yz)
            + coefficients[5] * (0.31539156525252005 * (2.0 * zz - xx - yy))
            + coefficients[6] * (-1.0925484305920792 * xz)
            + coefficients[7] * (0.5462742152960396 * (xx - yy));
        #if SH_BANDS > 2
            let third = textureLoad(splatSH_8to11, uv, 0);
            coefficients[7] = unpack111011s(third.x);
            coefficients[8] = unpack111011s(third.y);
            coefficients[9] = unpack111011s(third.z);
            coefficients[10] = unpack111011s(third.w);
            let fourth = textureLoad(splatSH_12to15, uv, 0);
            coefficients[11] = unpack111011s(fourth.x);
            coefficients[12] = unpack111011s(fourth.y);
            coefficients[13] = unpack111011s(fourth.z);
            coefficients[14] = unpack111011s(fourth.w);
            result += coefficients[8] * (-0.5900435899266435 * direction.y * (3.0 * xx - yy))
                + coefficients[9] * (2.890611442640554 * xy * direction.z)
                + coefficients[10] * (-0.4570457994644658 * direction.y * (4.0 * zz - xx - yy))
                + coefficients[11] * (0.3731763325901154 * direction.z * (2.0 * zz - 3.0 * xx - 3.0 * yy))
                + coefficients[12] * (-0.4570457994644658 * direction.x * (4.0 * zz - xx - yy))
                + coefficients[13] * (1.445305721320277 * direction.z * (xx - yy))
                + coefficients[14] * (-0.5900435899266435 * direction.x * (xx - 3.0 * yy));
        #endif
    #endif
    return result * scale;
}
#endif

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    // one draw instance per gaussian instance; the static data is reached
    // through the instance's source row
    let instance = uniform.instanceBase + pcInstanceIndex;
    let uv = splatUv(instanceSource[instance]);
    let state = instanceFlagByte(instance);
    // centers draw opaque, so the unselected colour's alpha can no longer shade
    // them - it only says whether they are drawn at all, keeping the picker's
    // "alpha 0 hides the centers" behaviour
    if ((state & 2u) != 0u || uniform.unselectedClr.a <= 0.0
        || (uniform.selectionOnly != 0u && (state & 1u) == 0u)) {
        output.position = vec4f(0.0, 0.0, 2.0, 1.0);
        return output;
    }

    let model = uniform.matrix_model * paletteMatrix(instancePalette[instance] & 0xffffu);
    let center = bitcast<vec3f>(textureLoad(splatPosition, uv, 0).xyz);
    let worldPosition = model * vec4f(center, 1.0);
    let projected = uniform.matrix_viewProjection * worldPosition;
    let offset = input.vertex_position * uniform.splatSize / uniform.viewportSize * projected.w;
    // keep the center's own depth so overlapping centers resolve nearest-first in
    // the depth buffer instead of by instance order. Clamped into [0, w] like the
    // gaussian renderer does, so a center straddling the near plane still draws
    output.position = vec4f(projected.xy + offset, clamp(projected.z, 0.0, projected.w), projected.w);

    var gaussianColor = uniform.unselectedClr.rgb;
    if (uniform.useGaussianColor > 0.0) {
        gaussianColor = textureLoad(splatColor, uv, 0).rgb;
        #if SH_BANDS > 0
            let worldDirection = normalize(worldPosition.xyz - uniform.view_position);
            let modelDirection = normalize(transpose(mat3x3f(model[0].xyz, model[1].xyz, model[2].xyz)) * worldDirection);
            gaussianColor += evaluateSH(uv, modelDirection);
        #endif
    }
    let selected = select(0.0, uniform.selectedClr.a, state == 1u);
    output.overlayColor = vec4f(mix(gaussianColor, uniform.selectedClr.rgb, selected), 1.0);
    return output;
}
`;

const fragmentShader = /* wgsl */`
varying overlayColor: vec4f;

@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
    var output: FragmentOutput;
    output.color = input.overlayColor;
    return output;
}
`;

export { vertexShader, fragmentShader };
