const vertexShader = /* wgsl */`
attribute vertex_position: vec2f;

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    output.position = vec4f(input.vertex_position, 0.0, 1.0);
    return output;
}
`;

const fragmentShader = /* wgsl */`
var srcTexture: texture_2d<f32>;

@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
    var output: FragmentOutput;
    output.color = textureLoad(srcTexture, vec2i(pcPosition.xy), 0);
    return output;
}
`;

export { vertexShader, fragmentShader };
