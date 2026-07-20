// shaders for the shared in-scene tool overlay (dots, lines, fills).
// base passes render on the world layer so gaussians in front cover them;
// ghost passes re-render the geometry after the splat layer, dimmed and
// without depth testing, so occluded parts remain faintly visible.

const dotVertexShader = /* wgsl */`
attribute vertex_position: vec3f;
attribute vertex_texCoord0: vec2f;

uniform matrix_model: mat4x4f;
uniform matrix_viewProjection: mat4x4f;

varying texCoord: vec2f;

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    output.texCoord = input.vertex_texCoord0;
    output.position = uniform.matrix_viewProjection * uniform.matrix_model * vec4f(input.vertex_position, 1.0);
    return output;
}
`;

const dotFragmentShader = /* wgsl */`
uniform ghost: f32;

var dotTexture: texture_2d<f32>;
var dotTexture_sampler: sampler;

varying texCoord: vec2f;

@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
    var output: FragmentOutput;
    let tex = textureSample(dotTexture, dotTexture_sampler, input.texCoord);
    if (uniform.ghost == 0.0) {
        // opaque cutout so the base pass writes depth
        if (tex.a < 0.5) {
            discard;
        }
        output.color = vec4f(tex.rgb, 1.0);
    } else {
        output.color = vec4f(tex.rgb, tex.a * uniform.ghost);
    }
    return output;
}
`;

const lineVertexShader = /* wgsl */`
attribute vertex_position: vec3f;

uniform matrix_model: mat4x4f;
uniform matrix_viewProjection: mat4x4f;

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    output.position = uniform.matrix_viewProjection * uniform.matrix_model * vec4f(input.vertex_position, 1.0);
    return output;
}
`;

const lineFragmentShader = /* wgsl */`
uniform lineColor: vec4f;

@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
    var output: FragmentOutput;
    output.color = uniform.lineColor;
    return output;
}
`;

const fillVertexShader = /* wgsl */`
attribute vertex_position: vec3f;

uniform matrix_model: mat4x4f;
uniform matrix_viewProjection: mat4x4f;

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    output.position = uniform.matrix_viewProjection * uniform.matrix_model * vec4f(input.vertex_position, 1.0);
    return output;
}
`;

const fillFragmentShader = /* wgsl */`
uniform fillColor: vec4f;

var blueNoiseTex32: texture_2d<f32>;

fn writeDepth(alpha: f32) -> bool {
    let size = vec2i(textureDimensions(blueNoiseTex32, 0));
    let texel = vec2i(pcPosition.xy) % size;
    return alpha > textureLoad(blueNoiseTex32, texel, 0).y;
}

@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
    var output: FragmentOutput;
    output.color = uniform.fillColor;
    output.fragDepth = select(1.0, pcPosition.z, writeDepth(uniform.fillColor.a));
    return output;
}
`;

export {
    dotVertexShader,
    dotFragmentShader,
    lineVertexShader,
    lineFragmentShader,
    fillVertexShader,
    fillFragmentShader
};
