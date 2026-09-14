// WGSL shared by the projector, the gaussian draw and the centres overlay, so
// the rules all three must agree on exist once.

// Which splats the edit overlays (rings, centres) draw for. flags are the
// instance state bits as the projector copies them into the cache: bit 0
// selected, bit 1 locked. A locked splat never gets an overlay; in
// selection-only mode neither does an unselected one. The projector exempts
// ringed splats from the motion cull with the same test, so a rule change here
// reaches every consumer.
const overlayEligibleWGSL = /* wgsl */`
fn overlayEligible(flags: u32, selectionOnly: bool) -> bool {
    return (flags & 2u) == 0u && (!selectionOnly || (flags & 1u) != 0u);
}`;

// The compact list holds two lists in one buffer: survivors appended from the
// front, and - while the centres overlay is up - culled splats appended from
// the back, so the sort and the gaussian draw stay at survivor count while
// centres still cover every projected splat. The tail is written by the
// projector and read only by the centres draw; nothing else may read
// compactEntries beyond the survivor count.
const compactTailWGSL = /* wgsl */`
fn compactTailSlot(tail: u32, capacity: u32) -> u32 {
    return capacity - 1u - tail;
}`;

export { overlayEligibleWGSL, compactTailWGSL };
