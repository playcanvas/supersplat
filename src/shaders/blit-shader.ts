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
// every pass that draws with this shader (final blit, Underlay, DataProcessor.copyRt)
// must set both: uniforms resolve through the shared device scope, so one left
// unset holds whatever the last pass wrote
uniform blitScale: vec2f;
uniform overdraw: u32;

fn ld(p: vec2i) -> vec4f {
    let dims = vec2i(textureDimensions(srcTexture));
    return textureLoad(srcTexture, clamp(p, vec2i(0), dims - vec2i(1)), 0);
}

// Overdraw view: the splat pass accumulated its per-pixel fragment count in red
// (see projected-splat-shader). A log ramp keeps both a lone splat and a pile of
// hundreds readable: stop k is the colour of 2^k - 1 fragments, so 1, 3, 7 ...
// 2047 run black -> blue -> cyan -> green -> yellow -> red -> magenta -> white.
// The top is where the buffer stops counting: half floats space by 2 from 2048,
// so adding 1 rounds back and the sum never passes it. The grid and overlays
// share the buffer but never exceed red 1, so they read as under one fragment.
// OverdrawLegend draws the same table, so the two have to stay in step
fn overdrawColor(count: f32) -> vec3f {
    var stops = array<vec3f, 12>(
        vec3f(0.0, 0.0, 0.0),
        vec3f(0.0, 0.0, 0.4),
        vec3f(0.0, 0.0, 1.0),
        vec3f(0.0, 0.5, 1.0),
        vec3f(0.0, 1.0, 1.0),
        vec3f(0.0, 1.0, 0.0),
        vec3f(0.5, 1.0, 0.0),
        vec3f(1.0, 1.0, 0.0),
        vec3f(1.0, 0.5, 0.0),
        vec3f(1.0, 0.0, 0.0),
        vec3f(1.0, 0.0, 1.0),
        vec3f(1.0, 1.0, 1.0)
    );
    let x = clamp(log2(1.0 + max(count, 0.0)), 0.0, 11.0);
    let i = u32(min(x, 10.0));
    return mix(stops[i], stops[i + 1u], x - f32(i));
}

@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
    var output: FragmentOutput;
    // map backbuffer pixel → source pixel so a smaller (lower-res) render target
    // upscales to fill the backbuffer (nearest). blitScale = srcSize / dstSize; = 1 at full res
    let src = vec2i(vec2f(pcPosition.xy) * uniform.blitScale);

    if (uniform.overdraw != 0u) {
        output.color = vec4f(overdrawColor(ld(src).r), 1.0);
        return output;
    }

    output.color = ld(src);
    return output;
}
`;

export { vertexShader, fragmentShader };
