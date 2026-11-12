// WGSL shared by the projector, the gaussian draw and the centres overlay, so
// the rules all three must agree on exist once.

// Which splats the edit overlays (rings, centres) draw for. flags are the
// instance state bits as the projector copies them into the cache: bit 0
// selected, bit 1 locked. A locked splat never gets an overlay; in
// selection-only mode neither does an unselected one. The projector exempts
// ringed splats from the motion cull with the same test, so a rule change here
// reaches every consumer.
const overlayEligibleWGSL = /* wgsl */ `
fn overlayEligible(flags: u32, selectionOnly: bool) -> bool {
    return (flags & 2u) == 0u && (!selectionOnly || (flags & 1u) != 0u);
}`;

// The compact list holds two lists in one buffer: survivors appended from the
// front, and - while the centres overlay is up - culled splats appended from
// the back, so the sort and the gaussian draw stay at survivor count while
// centres still cover every projected splat. The tail is written by the
// projector and read only by the centres draw; nothing else may read
// compactEntries beyond the survivor count.
const compactTailWGSL = /* wgsl */ `
fn compactTailSlot(tail: u32, capacity: u32) -> u32 {
    return capacity - 1u - tail;
}`;

// A splat's opacity is true (linear) opacity, above 1 for merged gaussians
// (decimated scenes, SOG v3). The projector stores it in one cache byte in SOG
// v3's encoding, alpha = (1.25 b / 255)^2, which holds 0 to 1.5625. Above 1 the
// gaussian draws as the engine's does: a plateau at full alpha out to
// splatPlateauCore of the quad's half extent, and the falloff stretched over
// the rest (the engine's gsplatPlateauCore and splat shader).
const splatAlphaWGSL = /* wgsl */ `
fn encodeSplatAlpha(alpha: f32) -> u32 {
    return u32(sqrt(clamp(alpha, 0.0, 1.5625)) * (255.0 / 1.25) + 0.5);
}

fn decodeSplatAlpha(bits: u32) -> f32 {
    let o = f32(bits & 0xffu) * (1.25 / 255.0);
    return o * o;
}

// the radius, in units of the quad's half extent, out to which alpha above 1
// holds at full alpha
fn splatPlateauCore(alpha: f32) -> f32 {
    if (alpha <= 1.0) {
        return 0.0;
    }
    let t = min(alpha - 1.0, 0.5625);
    return sqrt(0.28986718 + 0.62504992 * t) - 0.53839315;
}

// the falloff at r^2 (in units of the quad's half extent), zero at the quad's
// edge: (exp(-4 x) - exp(-4)) / (1 - exp(-4)), times alpha up to 1, with the
// plateau above 1
fn splatAlpha(r2: f32, alpha: f32) -> f32 {
    var x = r2;
    if (alpha > 1.0) {
        let core = splatPlateauCore(alpha);
        let c = max(0.0, sqrt(r2) - core) / (1.0 - core);
        x = c * c;
    }
    let e4 = exp(-4.0);
    return (exp(x * -4.0) - e4) / (1.0 - e4) * min(alpha, 1.0);
}`;

export { overlayEligibleWGSL, compactTailWGSL, splatAlphaWGSL };
