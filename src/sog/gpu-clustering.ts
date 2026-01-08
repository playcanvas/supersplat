/**
 * WebGPU compute shader for k-means clustering.
 * Port of splat-transform's gpu-clustering.ts using PlayCanvas Compute API.
 */

import {
    BUFFERUSAGE_COPY_DST,
    BUFFERUSAGE_COPY_SRC,
    SHADERLANGUAGE_WGSL,
    SHADERSTAGE_COMPUTE,
    UNIFORMTYPE_UINT,
    BindGroupFormat,
    BindStorageBufferFormat,
    BindUniformBufferFormat,
    Compute,
    FloatPacking,
    Shader,
    StorageBuffer,
    UniformBufferFormat,
    UniformFormat,
    WebgpuGraphicsDevice
} from 'playcanvas';

import { DataTable } from './data-table';

/**
 * Generate WGSL compute shader for clustering.
 */
const clusterWgsl = (numColumns: number, useF16: boolean) => {
    const floatType = useF16 ? 'f16' : 'f32';

    return /* wgsl */ `
${useF16 ? 'enable f16;' : ''}

struct Uniforms {
    numPoints: u32,
    numCentroids: u32
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> points: array<${floatType}>;
@group(0) @binding(2) var<storage, read> centroids: array<${floatType}>;
@group(0) @binding(3) var<storage, read_write> results: array<u32>;

const numColumns = ${numColumns};   // number of columns in the points and centroids tables
const chunkSize = 128u;             // must be a multiple of 64
var<workgroup> sharedChunk: array<${floatType}, numColumns * chunkSize>;

// calculate the squared distance between the point and centroid
fn calcDistanceSqr(point: array<${floatType}, numColumns>, centroid: u32) -> f32 {
    var result = 0.0;

    var ci = centroid * numColumns;

    for (var i = 0u; i < numColumns; i++) {
        let v = f32(point[i] - sharedChunk[ci+i]);
        result += v * v;
    }

    return result;
}

@compute @workgroup_size(64)
fn main(
    @builtin(local_invocation_index) local_id : u32,
    @builtin(global_invocation_id) global_id: vec3u,
    @builtin(num_workgroups) num_workgroups: vec3u
) {
    // calculate row index for this thread point
    let pointIndex = global_id.x + global_id.y * num_workgroups.x * 64u;

    // copy the point data from global memory
    var point: array<${floatType}, numColumns>;
    if (pointIndex < uniforms.numPoints) {
        for (var i = 0u; i < numColumns; i++) {
            point[i] = points[pointIndex * numColumns + i];
        }
    }

    var mind = 1000000.0;
    var mini = 0u;

    // work through the list of centroids in shared memory chunks
    let numChunks = u32(ceil(f32(uniforms.numCentroids) / f32(chunkSize)));
    for (var i = 0u; i < numChunks; i++) {

        // copy this thread's slice of the centroid shared chunk data
        let dstRow = local_id * (chunkSize / 64u);
        let srcRow = min(uniforms.numCentroids, i * chunkSize + local_id * chunkSize / 64u);
        let numRows = min(uniforms.numCentroids, srcRow + chunkSize / 64u) - srcRow;

        var dst = dstRow * numColumns;
        var src = srcRow * numColumns;

        for (var c = 0u; c < numRows * numColumns; c++) {
            sharedChunk[dst + c] = centroids[src + c];
        }

        // wait for all threads to finish writing their part of centroids shared memory buffer
        workgroupBarrier();

        // loop over the next chunk of centroids finding the closest
        if (pointIndex < uniforms.numPoints) {
            let thisChunkSize = min(chunkSize, uniforms.numCentroids - i * chunkSize);
            for (var c = 0u; c < thisChunkSize; c++) {
                let d = calcDistanceSqr(point, c);
                if (d < mind) {
                    mind = d;
                    mini = i * chunkSize + c;
                }
            }
        }

        // next loop will overwrite the shared memory, so wait
        workgroupBarrier();
    }

    if (pointIndex < uniforms.numPoints) {
        results[pointIndex] = mini;
    }
}
`;
};

const roundUp = (value: number, multiple: number) => {
    return Math.ceil(value / multiple) * multiple;
};

const interleaveData = (result: Uint16Array | Float32Array, dataTable: DataTable, numRows: number, rowOffset: number) => {
    const { numColumns } = dataTable;

    if (result instanceof Uint16Array) {
        // interleave shorts (f16)
        for (let c = 0; c < numColumns; ++c) {
            const column = dataTable.columns[c];
            for (let r = 0; r < numRows; ++r) {
                result[r * numColumns + c] = FloatPacking.float2Half(column.data[rowOffset + r]);
            }
        }
    } else {
        // interleave floats
        for (let c = 0; c < numColumns; ++c) {
            const column = dataTable.columns[c];
            for (let r = 0; r < numRows; ++r) {
                result[r * numColumns + c] = column.data[rowOffset + r];
            }
        }
    }
};

/**
 * GPU-accelerated clustering for k-means.
 * Uses WebGPU compute shaders to find nearest centroids for each point.
 */
class GpuClustering {
    private device: WebgpuGraphicsDevice;
    private shader: Shader;
    private bindGroupFormat: BindGroupFormat;
    private compute: Compute;
    private pointsBuffer: StorageBuffer;
    private centroidsBuffer: StorageBuffer;
    private resultsBuffer: StorageBuffer;
    private interleavedPoints: Uint16Array | Float32Array;
    private interleavedCentroids: Uint16Array | Float32Array;
    private resultsData: Uint32Array;
    private numColumns: number;
    private numCentroids: number;
    private batchSize: number;
    private useF16: boolean;

    constructor(device: WebgpuGraphicsDevice, numColumns: number, numCentroids: number) {
        this.device = device;
        this.numColumns = numColumns;
        this.numCentroids = numCentroids;

        // Check if device supports f16
        this.useF16 = !!(('supportsShaderF16' in device) && device.supportsShaderF16);

        const workgroupSize = 64;
        const workgroupsPerBatch = 1024;
        this.batchSize = workgroupsPerBatch * workgroupSize;

        this.bindGroupFormat = new BindGroupFormat(device, [
            new BindUniformBufferFormat('uniforms', SHADERSTAGE_COMPUTE),
            new BindStorageBufferFormat('pointsBuffer', SHADERSTAGE_COMPUTE, true),
            new BindStorageBufferFormat('centroidsBuffer', SHADERSTAGE_COMPUTE, true),
            new BindStorageBufferFormat('resultsBuffer', SHADERSTAGE_COMPUTE)
        ]);

        this.shader = new Shader(device, {
            name: 'compute-cluster',
            shaderLanguage: SHADERLANGUAGE_WGSL,
            cshader: clusterWgsl(numColumns, this.useF16),
            // @ts-ignore
            computeUniformBufferFormats: {
                uniforms: new UniformBufferFormat(device, [
                    new UniformFormat('numPoints', UNIFORMTYPE_UINT),
                    new UniformFormat('numCentroids', UNIFORMTYPE_UINT)
                ])
            },
            // @ts-ignore
            computeBindGroupFormat: this.bindGroupFormat
        });

        this.interleavedPoints = this.useF16 ?
            new Uint16Array(roundUp(numColumns * this.batchSize, 2)) :
            new Float32Array(numColumns * this.batchSize);
        this.interleavedCentroids = this.useF16 ?
            new Uint16Array(roundUp(numColumns * numCentroids, 2)) :
            new Float32Array(numColumns * numCentroids);
        this.resultsData = new Uint32Array(this.batchSize);

        this.pointsBuffer = new StorageBuffer(
            device,
            this.interleavedPoints.byteLength,
            BUFFERUSAGE_COPY_DST
        );

        this.centroidsBuffer = new StorageBuffer(
            device,
            this.interleavedCentroids.byteLength,
            BUFFERUSAGE_COPY_DST
        );

        this.resultsBuffer = new StorageBuffer(
            device,
            this.resultsData.byteLength,
            BUFFERUSAGE_COPY_SRC | BUFFERUSAGE_COPY_DST
        );

        this.compute = new Compute(device, this.shader, 'compute-cluster');
        this.compute.setParameter('pointsBuffer', this.pointsBuffer);
        this.compute.setParameter('centroidsBuffer', this.centroidsBuffer);
        this.compute.setParameter('resultsBuffer', this.resultsBuffer);
    }

    /**
     * Execute clustering to find nearest centroid for each point.
     *
     * @param points - DataTable of points to cluster
     * @param centroids - DataTable of centroid positions
     * @param labels - Output array to store cluster assignments
     */
    async execute(points: DataTable, centroids: DataTable, labels: Uint32Array): Promise<void> {
        const numPoints = points.numRows;
        const numBatches = Math.ceil(numPoints / this.batchSize);

        // upload centroid data to gpu
        interleaveData(this.interleavedCentroids, centroids, this.numCentroids, 0);
        this.centroidsBuffer.write(0, this.interleavedCentroids, 0, this.interleavedCentroids.length);
        this.compute.setParameter('numCentroids', this.numCentroids);

        for (let batch = 0; batch < numBatches; batch++) {
            const currentBatchSize = Math.min(numPoints - batch * this.batchSize, this.batchSize);
            const groups = Math.ceil(currentBatchSize / 64);

            // write this batch of point data to gpu
            interleaveData(this.interleavedPoints, points, currentBatchSize, batch * this.batchSize);
            const writeLength = this.useF16 ?
                roundUp(this.numColumns * currentBatchSize, 2) :
                this.numColumns * currentBatchSize;
            this.pointsBuffer.write(0, this.interleavedPoints, 0, writeLength);
            this.compute.setParameter('numPoints', currentBatchSize);

            // start compute job
            this.compute.setupDispatch(groups);
            this.device.computeDispatch([this.compute], `cluster-dispatch-${batch}`);

            // read results from gpu and store in labels
            await this.resultsBuffer.read(0, currentBatchSize * 4, this.resultsData, true);
            labels.set(this.resultsData.subarray(0, currentBatchSize), batch * this.batchSize);
        }
    }

    destroy() {
        this.pointsBuffer.destroy();
        this.centroidsBuffer.destroy();
        this.resultsBuffer.destroy();
        this.shader.destroy();
        this.bindGroupFormat.destroy();
    }
}

export { GpuClustering };
