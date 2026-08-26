const vertexShader = /* wgsl */`
attribute vertex_position: vec3f;
attribute vertex_color: vec4f;

varying vColor: vec4f;
varying vZW: vec2f;

uniform matrix_model: mat4x4f;
uniform matrix_viewProjection: mat4x4f;

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    let position = uniform.matrix_viewProjection * uniform.matrix_model * vec4f(input.vertex_position, 1.0);
    output.position = vec4f(position.xy, 0.0, position.w);
    output.vColor = input.vertex_color;
    output.vZW = position.zw;
    return output;
}
`;

const fragmentShader = /* wgsl */`
varying vColor: vec4f;
varying vZW: vec2f;

@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
    var output: FragmentOutput;
    output.color = input.vColor;
    output.fragDepth = clamp(input.vZW.x / input.vZW.y, 0.0, 1.0);
    return output;
}
`;

export { vertexShader, fragmentShader };
