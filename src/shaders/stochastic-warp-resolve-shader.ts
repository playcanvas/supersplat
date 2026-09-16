import { stochasticWarpWGSL } from './stochastic-warp-chunk';

const fragmentShader = /* wgsl */`
var srcTexture: texture_2d<f32>;
var srcTexture_sampler: sampler;
uniform warpStrength: f32;
uniform quadResolve: u32;

${stochasticWarpWGSL}

fn sampleSplat(p: vec2i) -> vec4f {
    let dims = vec2i(textureDimensions(srcTexture));
    return textureLoad(srcTexture, clamp(p, vec2i(0), dims - vec2i(1)), 0);
}

@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
    var output: FragmentOutput;
    let dims = vec2f(textureDimensions(srcTexture));
    // Inverse image reconstruction: an unwarped output pixel looks up its
    // forward-warped position in the splat target. Keep fractional coordinates
    // so movement through the nonuniform sampling lattice remains smooth.
    let p = pcPosition.xy / dims * 2.0 - vec2f(1.0);
    let src = (warpPosition(p, uniform.warpStrength) * 0.5 + vec2f(0.5)) * dims - vec2f(0.5);

    if (uniform.quadResolve == 0u) {
        output.color = sampleSplat(vec2i(floor(src + vec2f(0.5))));
        return output;
    }

    // Resolve on the same 2x2 lattice as the stochastic coverage thresholds,
    // interpolating quad means directly at the unwarped pixel's lookup. At
    // 2x centre magnification a quad covers about one output pixel, instead of
    // two. Colour and coverage are premultiplied for the unwarped background.
    let u = (src - vec2f(0.5)) * 0.5;
    let q0 = floor(u);
    let f = u - q0;
    // A bilinear sample at each quad centre is its 2x2 mean. Four samples
    // reconstruct the same filter as the sixteen individual texel loads.
    let uv = (q0 * 2.0 + vec2f(1.0)) / dims;
    let step = vec2f(2.0) / dims;
    let a = textureSampleLevel(srcTexture, srcTexture_sampler, uv, 0.0);
    let b = textureSampleLevel(srcTexture, srcTexture_sampler, uv + vec2f(step.x, 0.0), 0.0);
    let c = textureSampleLevel(srcTexture, srcTexture_sampler, uv + vec2f(0.0, step.y), 0.0);
    let d = textureSampleLevel(srcTexture, srcTexture_sampler, uv + step, 0.0);
    output.color = mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    return output;
}
`;

export { fragmentShader };
