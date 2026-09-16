// Expand the centre along each screen axis while keeping the viewport edges
// at +/-1. The derivative m / (1 + (m*m - 1)*x*x)^(3/2) is positive and falls
// smoothly toward the edges: no circular pinch or return to normal sampling.
// Strength 0..1 gives centre magnification m = 1..2 on both axes.
const stochasticWarpWGSL = /* wgsl */`
fn warpPosition(p: vec2f, strength: f32) -> vec2f {
    let m = 1.0 + strength;
    let d = sqrt(vec2f(1.0) + (m * m - 1.0) * p * p);
    return m * p / d;
}

// Apply the local Jacobian to a splat axis, both in NDC. This is the affine
// approximation of the warp over the splat footprint.
fn warpOffset(p: vec2f, offset: vec2f, strength: f32) -> vec2f {
    let m = 1.0 + strength;
    let d = sqrt(vec2f(1.0) + (m * m - 1.0) * p * p);
    return offset * m / (d * d * d);
}
`;

export { stochasticWarpWGSL };
