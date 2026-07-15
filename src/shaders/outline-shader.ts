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
uniform alphaCutoff: f32;
uniform clr: vec4f;

@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
    var output: FragmentOutput;
    let texel = vec2i(pcPosition.xy);
    if (textureLoad(srcTexture, texel, 0).a > uniform.alphaCutoff) {
        discard;
    }

    for (var x = -2; x <= 2; x++) {
        for (var y = -2; y <= 2; y++) {
            if (x != 0 && y != 0 && textureLoad(srcTexture, texel + vec2i(x, y), 0).a > uniform.alphaCutoff) {
                output.color = uniform.clr;
                return output;
            }
        }
    }

    discard;
    return output;
}
`;

export { vertexShader, fragmentShader };
