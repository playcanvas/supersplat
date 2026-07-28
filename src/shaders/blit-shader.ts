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
uniform quadResolve: u32;

@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
    var output: FragmentOutput;
    // map backbuffer pixel → source pixel so a smaller (lower-res) render target
    // upscales to fill the backbuffer (nearest). blitScale = srcSize / dstSize; = 1 at full res
    let src = vec2i(vec2f(pcPosition.xy) * uniform.blitScale);
    if (uniform.quadResolve != 0u) {
        // stochastic frames: box-average each source 2x2 quad so the four
        // stratified coverage samples per quad (see projected-splat-shader)
        // resolve to their mean. Edge-clamped for odd target sizes.
        let p0 = (src >> vec2u(1u)) << vec2u(1u);
        let p1 = min(p0 + vec2i(1), vec2i(textureDimensions(srcTexture)) - vec2i(1));
        output.color = (textureLoad(srcTexture, p0, 0)
            + textureLoad(srcTexture, vec2i(p1.x, p0.y), 0)
            + textureLoad(srcTexture, vec2i(p0.x, p1.y), 0)
            + textureLoad(srcTexture, p1, 0)) * 0.25;
    } else {
        output.color = textureLoad(srcTexture, src, 0);
    }
    return output;
}
`;

export { vertexShader, fragmentShader };
