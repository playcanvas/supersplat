// Folds the depth buffer a stochastic splat pass wrote into one max depth per
// block of pixels, for the next frame's projector. Each pixel of a stochastic
// frame keeps the nearest fragment that passed its coverage test, so the
// farthest depth in a block bounds what could still have shown behind the
// splats there (the occlusion cull in projected-splat-projector-shader).
//
// One workgroup per block; the block's pixels are strided over the threads and
// combined through a shared atomic max, which orders correctly on the bit
// patterns of non-negative floats. Pixels past the buffer's edge, in a partial
// last block, are skipped.
const projectedSplatDepthReduce = (blockSize: number) => /* wgsl */`
struct ReduceUniforms {
    width: u32,
    height: u32,
    blocksX: u32,
    pad0: u32
}

@group(0) @binding(0) var depthTexture: texture_depth_2d;
@group(0) @binding(1) var<storage, read_write> depthMax: array<f32>;
@group(0) @binding(2) var<uniform> uniforms: ReduceUniforms;

var<workgroup> blockMax: atomic<u32>;

@compute @workgroup_size(64)
fn main(
    @builtin(workgroup_id) block: vec3u,
    @builtin(local_invocation_index) thread: u32
) {
    if (thread == 0u) {
        atomicStore(&blockMax, 0u);
    }
    workgroupBarrier();

    let origin = block.xy * ${blockSize}u;
    var farthest = 0.0;
    for (var i = thread; i < ${blockSize * blockSize}u; i += 64u) {
        let pixel = origin + vec2u(i % ${blockSize}u, i / ${blockSize}u);
        if (pixel.x < uniforms.width && pixel.y < uniforms.height) {
            farthest = max(farthest, textureLoad(depthTexture, vec2i(pixel), 0));
        }
    }
    atomicMax(&blockMax, bitcast<u32>(farthest));
    workgroupBarrier();

    if (thread == 0u) {
        depthMax[block.y * uniforms.blocksX + block.x] = bitcast<f32>(atomicLoad(&blockMax));
    }
}
`;

export { projectedSplatDepthReduce };
