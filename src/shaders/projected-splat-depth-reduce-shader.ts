// Folds the depth buffer a stochastic splat pass wrote into one max depth per
// block of pixels, for the next frame's projector. Each pixel of a stochastic
// frame keeps the nearest fragment that passed its coverage test, so the
// farthest depth in a block bounds what could still have shown behind the
// splats there (the occlusion cull in projected-splat-projector-shader).
//
// The subgroup path handles four adjacent blocks per 128-thread workgroup,
// one per fixed 32-lane subgroup: no shared memory, atomics or barriers.
// The portable fallback uses one 64-thread workgroup and a shared atomic max
// per block. Partial edge blocks skip pixels outside the buffer in both paths.
const projectedSplatDepthReduce = (blockSize: number, subgroups: boolean) => /* wgsl */`
${subgroups ? 'enable subgroup_size_control;' : ''}

struct ReduceUniforms {
    width: u32,
    height: u32,
    blocksX: u32,
    pad0: u32
}

@group(0) @binding(0) var depthTexture: texture_depth_2d;
@group(0) @binding(1) var<storage, read_write> depthMax: array<f32>;
@group(0) @binding(2) var<uniform> uniforms: ReduceUniforms;

${subgroups ? '' : 'var<workgroup> blockMax: atomic<u32>;'}

@compute @workgroup_size(${subgroups ? 128 : 64})
${subgroups ? '@subgroup_size(32)' : ''}
fn main(
    @builtin(workgroup_id) group: vec3u,
    ${subgroups ? /* wgsl */`
    @builtin(subgroup_id) subgroup: u32,
    @builtin(subgroup_invocation_id) thread: u32
    ` : '@builtin(local_invocation_index) thread: u32'}
) {
    ${subgroups ? /* wgsl */`
    let block = vec2u(group.x * 4u + subgroup, group.y);
    ` : /* wgsl */`
    let block = group.xy;
    if (thread == 0u) {
        atomicStore(&blockMax, 0u);
    }
    workgroupBarrier();
    `}

    let origin = block * ${blockSize}u;
    var farthest = 0.0;
    for (var i = thread; i < ${blockSize * blockSize}u; i += ${subgroups ? 32 : 64}u) {
        let pixel = origin + vec2u(i % ${blockSize}u, i / ${blockSize}u);
        if (pixel.x < uniforms.width && pixel.y < uniforms.height) {
            farthest = max(farthest, textureLoad(depthTexture, vec2i(pixel), 0));
        }
    }
    ${subgroups ? /* wgsl */`
    let subgroupFarthest = subgroupMax(farthest);
    if (subgroupElect() && block.x < uniforms.blocksX) {
        depthMax[block.y * uniforms.blocksX + block.x] = subgroupFarthest;
    }
    ` : /* wgsl */`
    atomicMax(&blockMax, bitcast<u32>(farthest));
    workgroupBarrier();

    if (thread == 0u) {
        depthMax[block.y * uniforms.blocksX + block.x] = bitcast<f32>(atomicLoad(&blockMax));
    }
    `}
}
`;

export { projectedSplatDepthReduce };
