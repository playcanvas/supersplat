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
uniform blitScale: vec2f;

@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
    var output: FragmentOutput;
    // map backbuffer pixel → source pixel so a smaller (lower-res) render target
    // upscales to fill the backbuffer (nearest). blitScale = srcSize / dstSize; = 1 at full res
    output.color = textureLoad(srcTexture, vec2i(vec2f(pcPosition.xy) * uniform.blitScale), 0);
    return output;
}
`;

export { vertexShader, fragmentShader };
