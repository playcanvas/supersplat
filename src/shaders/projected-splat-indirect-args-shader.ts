// Single-thread pass that turns the projector's survivor count into gpu-driven
// arguments: the indexed draw args for the splat quad draw, and the dispatch args
// the radix sort reads. Nothing here comes back to the cpu, so a frame never
// stalls on the count.
//
// The dispatch-slot layout and the meaning of sortIndirectInfo are the contract of
// ComputeRadixSort#prepareIndirect(): [slotCount, g0, g1, g2] where each g is the
// elements-per-workgroup granularity of one slot, and each slot occupies three
// consecutive u32 (workgroup counts x, y, z).
const projectedSplatIndirectArgs = (instanceSize: number) => /* wgsl */`
struct DrawIndexedIndirectArgs {
    indexCount: u32,
    instanceCount: u32,
    firstIndex: u32,
    baseVertex: i32,
    firstInstance: u32
}

struct ArgsUniforms {
    drawSlot: u32,
    indexCount: u32,
    sortSlotBase: u32,
    pad0: u32,
    sortIndirectInfo: vec4u
}

@group(0) @binding(0) var<storage, read> splatCounter: array<u32>;
@group(0) @binding(1) var<storage, read_write> indirectDrawArgs: array<DrawIndexedIndirectArgs>;
@group(0) @binding(2) var<storage, read_write> indirectDispatchArgs: array<u32>;
@group(0) @binding(3) var<uniform> uniforms: ArgsUniforms;

fn writeDispatchSlot(slot: u32, count: u32, granularity: u32) {
    let offset = slot * 3u;
    indirectDispatchArgs[offset + 0u] = (count + granularity - 1u) / granularity;
    indirectDispatchArgs[offset + 1u] = 1u;
    indirectDispatchArgs[offset + 2u] = 1u;
}

@compute @workgroup_size(1)
fn main() {
    let count = splatCounter[0];

    // one draw instance covers ${instanceSize} quads
    indirectDrawArgs[uniforms.drawSlot] = DrawIndexedIndirectArgs(
        uniforms.indexCount,
        (count + ${instanceSize}u - 1u) / ${instanceSize}u,
        0u,
        0,
        0u
    );

    let info = uniforms.sortIndirectInfo;
    if (info.x >= 1u) {
        writeDispatchSlot(uniforms.sortSlotBase, count, info.y);
    }
    if (info.x >= 2u) {
        writeDispatchSlot(uniforms.sortSlotBase + 1u, count, info.z);
    }
    if (info.x >= 3u) {
        writeDispatchSlot(uniforms.sortSlotBase + 2u, count, info.w);
    }
}
`;

export { projectedSplatIndirectArgs };
