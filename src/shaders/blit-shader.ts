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

fn ld(p: vec2i) -> vec4f {
    let dims = vec2i(textureDimensions(srcTexture));
    return textureLoad(srcTexture, clamp(p, vec2i(0), dims - vec2i(1)), 0);
}

// Resolve a stochastic frame. Each stochastic fragment is opaque and tags itself
// with alpha 2 (see projected-splat-shader), so the source separates cleanly into
// splat and non-splat pixels - cameraColor is RGBA16F, and everything else drawn
// into it (grid, overlays, gizmos) can only reach alpha 1.
//
// The kernel is the aligned 2x2 quad average - matching the lattice the coverage
// samples are stratified over - bilinearly interpolated between quad centres
// rather than held, so there is no blockiness and no half-pixel shift. Expanded,
// that is a 4x4 tap whose per-axis weights are [(1-f)/2, (1-f)/2, f/2, f/2],
// where f is the position between quad centres; quad q's centre lies at source
// pixel-centre coordinate 2q + 1.
//
// Splat and background pixels are accumulated separately and composited at the
// resolved coverage, so a splat silhouette blends against what is actually behind
// it, and a neighbourhood containing no splat at all passes through untouched -
// which is what keeps the analytically-antialiased grid crisp during motion.
fn resolveStochastic(src: vec2i) -> vec4f {
    let u = (vec2f(src) - vec2f(0.5)) * 0.5;
    let q0 = floor(u);
    let f = u - q0;
    let base = vec2i(q0) * 2;

    var wx = array<f32, 4>((1.0 - f.x) * 0.5, (1.0 - f.x) * 0.5, f.x * 0.5, f.x * 0.5);
    var wy = array<f32, 4>((1.0 - f.y) * 0.5, (1.0 - f.y) * 0.5, f.y * 0.5, f.y * 0.5);

    var coverage = 0.0;
    var splat = vec3f(0.0);
    var background = vec3f(0.0);

    for (var j = 0; j < 4; j++) {
        for (var i = 0; i < 4; i++) {
            let texel = ld(base + vec2i(i, j));
            let w = wx[i] * wy[j];
            let isSplat = step(1.5, texel.a);
            coverage += w * isSplat;
            splat += (w * isSplat) * texel.rgb;
            background += (w * (1.0 - isSplat)) * texel.rgb;
        }
    }

    // nothing stochastic nearby: leave the pixel exactly as it was rendered
    if (coverage <= 0.0) {
        return ld(src);
    }

    let splatAvg = splat / coverage;
    let backgroundAvg = background / max(1.0 - coverage, 1e-5);
    return vec4f(mix(backgroundAvg, splatAvg, coverage), 1.0);
}

// The original resolve, kept for the devtools A/B switch (scene.resolveMode):
// average the aligned 2x2 quad and hold that one value across all four of its
// pixels. Every fragment in a quad snaps to the same quad origin and so
// redundantly computes the same average - the cheap form is a single bilinear tap
// at the quad centre, since a bilinear sample at the exact midpoint of a 2x2 texel
// block is its mean.
//
// Two things make it worse than the kernel above, and both are visible: it holds
// instead of interpolating, so the output is blocky at quad resolution and thin
// lines alias; and it is unmasked, so it filters the grid and overlays along with
// the splats even though those were never stochastic.
fn resolveBlock(src: vec2i) -> vec4f {
    let base = src / 2 * 2;
    var sum = vec4f(0.0);
    for (var j = 0; j < 2; j++) {
        for (var i = 0; i < 2; i++) {
            sum += ld(base + vec2i(i, j));
        }
    }
    // alpha carries the stochastic sentinel, so never let it reach the backbuffer
    return vec4f(sum.rgb * 0.25, 1.0);
}

@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
    var output: FragmentOutput;
    // map backbuffer pixel → source pixel so a smaller (lower-res) render target
    // upscales to fill the backbuffer (nearest). blitScale = srcSize / dstSize; = 1 at full res
    let src = vec2i(vec2f(pcPosition.xy) * uniform.blitScale);

    // 0 = no resolve, 1 = original aligned block average, 2 = masked resolve
    if (uniform.quadResolve == 2u) {
        output.color = resolveStochastic(src);
    } else if (uniform.quadResolve == 1u) {
        output.color = resolveBlock(src);
    } else {
        output.color = ld(src);
    }
    return output;
}
`;

export { vertexShader, fragmentShader };
