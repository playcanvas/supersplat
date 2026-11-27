const vertexShader = /* wgsl */ `
attribute vertex_position: vec2f;

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    output.position = vec4f(input.vertex_position, 0.0, 1.0);
    return output;
}
`;

const fragmentShader = /* wgsl */ `
var srcTexture: texture_2d<f32>;
uniform alphaCutoff: f32;
uniform clr: vec4f;

fn inside(texel: vec2i) -> bool {
    return textureLoad(srcTexture, texel, 0).a > uniform.alphaCutoff;
}

// An outside pixel next to the selection takes the outline, unless the
// selection lies on two opposite sides of it within 2 pixels: then it is a
// thin gap through the selection rather than its edge - a grid line drawn in
// front of it, or the space between two gaussians - and stays clear. Each
// pair is an offset and its mirror, so the 5x5 neighbourhood is read once
@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
    var output: FragmentOutput;
    let texel = vec2i(pcPosition.xy);
    if (inside(texel)) {
        discard;
    }

    var edge = false;
    for (var y = 0; y <= 2; y++) {
        for (var x = -2; x <= 2; x++) {
            if (y == 0 && x <= 0) {
                continue;
            }
            let a = inside(texel + vec2i(x, y));
            let b = inside(texel - vec2i(x, y));
            if (a && b) {
                discard;
            }
            edge = edge || a || b;
        }
    }

    if (!edge) {
        discard;
    }

    output.color = uniform.clr;
    return output;
}
`;

export { vertexShader, fragmentShader };
