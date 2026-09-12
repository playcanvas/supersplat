// Stochastic frames draw front to back in 256 depth buckets. The projector has
// written each survivor's bucket as its sort key; these two passes are a
// counting sort over the compact list. Both aggregate in workgroup memory
// first and touch the global counters once per bucket per workgroup: millions
// of survivors landing their atomics on 256 addresses directly cost more than
// the sort they replace. The scatter's output goes into the radix sort's idle
// result buffer, so the draw binds the same buffer on both paths.

// survivors per bucket
const projectedSplatBucketCount = (elementsPerWorkgroup: number) => /* wgsl */`
@group(0) @binding(0) var<storage, read> sortKeys: array<u32>;
@group(0) @binding(1) var<storage, read> splatCounter: array<u32>;
@group(0) @binding(2) var<storage, read_write> bucketCounts: array<atomic<u32>>;

var<workgroup> localCounts: array<atomic<u32>, 256>;

@compute @workgroup_size(256)
fn main(
    @builtin(workgroup_id) wid: vec3u,
    @builtin(local_invocation_id) lid: vec3u
) {
    atomicStore(&localCounts[lid.x], 0u);
    workgroupBarrier();
    let count = splatCounter[0];
    let base = wid.x * ${elementsPerWorkgroup}u;
    for (var i = 0u; i < ${elementsPerWorkgroup / 256}u; i++) {
        let index = base + i * 256u + lid.x;
        if (index < count) {
            atomicAdd(&localCounts[sortKeys[index]], 1u);
        }
    }
    workgroupBarrier();
    let n = atomicLoad(&localCounts[lid.x]);
    if (n != 0u) {
        atomicAdd(&bucketCounts[lid.x], n);
    }
}
`;

// places every survivor after those of nearer buckets. Inside a bucket each
// workgroup's survivors stay together and in compact order, which keeps the
// tiler's locality
const projectedSplatBucketScatter = (elementsPerWorkgroup: number) => /* wgsl */`
@group(0) @binding(0) var<storage, read> sortKeys: array<u32>;
@group(0) @binding(1) var<storage, read> compactEntries: array<u32>;
@group(0) @binding(2) var<storage, read> splatCounter: array<u32>;
// [0, 256) bucket counts from the count pass, [256, 512) cursors
@group(0) @binding(3) var<storage, read_write> bucketCounts: array<atomic<u32>>;
@group(0) @binding(4) var<storage, read_write> order: array<u32>;

// where each bucket starts in the output, the workgroup's share of each
// bucket, and where that share starts within the bucket
var<workgroup> bucketStart: array<u32, 256>;
var<workgroup> localCounts: array<atomic<u32>, 256>;
var<workgroup> localStart: array<u32, 256>;

const PER_THREAD = ${elementsPerWorkgroup / 256}u;

@compute @workgroup_size(256)
fn main(
    @builtin(workgroup_id) wid: vec3u,
    @builtin(local_invocation_id) lid: vec3u
) {
    // exclusive prefix of the bucket counts, rescanned per workgroup: 256
    // values, cheaper than a separate pass
    let own = atomicLoad(&bucketCounts[lid.x]);
    bucketStart[lid.x] = own;
    atomicStore(&localCounts[lid.x], 0u);
    for (var stride = 1u; stride < 256u; stride = stride << 1u) {
        workgroupBarrier();
        let source = select(0u, lid.x - stride, lid.x >= stride);
        let add = select(0u, bucketStart[source], lid.x >= stride);
        workgroupBarrier();
        bucketStart[lid.x] += add;
    }
    workgroupBarrier();
    bucketStart[lid.x] -= own;

    // each survivor's position within the workgroup's share of its bucket
    let count = splatCounter[0];
    let base = wid.x * ${elementsPerWorkgroup}u;
    var buckets: array<u32, PER_THREAD>;
    var offsets: array<u32, PER_THREAD>;
    for (var i = 0u; i < PER_THREAD; i++) {
        let index = base + i * 256u + lid.x;
        if (index < count) {
            let bucket = sortKeys[index];
            buckets[i] = bucket;
            offsets[i] = atomicAdd(&localCounts[bucket], 1u);
        }
    }
    workgroupBarrier();

    // reserve the workgroup's share of each bucket it touched
    let share = atomicLoad(&localCounts[lid.x]);
    if (share != 0u) {
        localStart[lid.x] = atomicAdd(&bucketCounts[256u + lid.x], share);
    }
    workgroupBarrier();

    for (var i = 0u; i < PER_THREAD; i++) {
        let index = base + i * 256u + lid.x;
        if (index < count) {
            let bucket = buckets[i];
            order[bucketStart[bucket] + localStart[bucket] + offsets[i]] = compactEntries[index];
        }
    }
}
`;

export { projectedSplatBucketCount, projectedSplatBucketScatter };
