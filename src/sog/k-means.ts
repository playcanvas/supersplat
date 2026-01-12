/**
 * K-means clustering algorithm using WebGPU compute shaders.
 * Port of splat-transform's k-means.ts.
 */

import { WebgpuGraphicsDevice } from 'playcanvas';

import { Column, DataTable } from './data-table';
import { GpuClustering } from './gpu-clustering';

/**
 * Use Floyd's algorithm to pick m unique random indices from 0..n-1.
 */
const pickRandomIndices = (n: number, m: number): number[] => {
    const chosen = new Set<number>();
    for (let j = n - m; j < n; j++) {
        const t = Math.floor(Math.random() * (j + 1));
        chosen.add(chosen.has(t) ? j : t);
    }
    return [...chosen];
};

const initializeCentroids = (dataTable: DataTable, centroids: DataTable, row: Record<string, number>) => {
    const indices = pickRandomIndices(dataTable.numRows, centroids.numRows);
    for (let i = 0; i < centroids.numRows; ++i) {
        dataTable.getRow(indices[i], row);
        centroids.setRow(i, row);
    }
};

/**
 * In the 1D case, use quantile-based initialization for better handling of skewed data.
 */
const initializeCentroids1D = (dataTable: DataTable, centroids: DataTable) => {
    const data = dataTable.getColumn(0).data;
    const n = dataTable.numRows;
    const k = centroids.numRows;

    // Sort data to compute quantiles
    const sorted = Float32Array.from(data).sort((a, b) => a - b);

    const centroidsData = centroids.getColumn(0).data;
    for (let i = 0; i < k; ++i) {
        // Place centroid at the center of its expected cluster region
        const quantile = (2 * i + 1) / (2 * k);
        const index = Math.min(Math.floor(quantile * n), n - 1);
        centroidsData[i] = sorted[index];
    }
};

const calcAverage = (dataTable: DataTable, cluster: number[], row: Record<string, number>) => {
    const keys = dataTable.columnNames;

    for (let i = 0; i < keys.length; ++i) {
        row[keys[i]] = 0;
    }

    const dataRow: Record<string, number> = {};
    for (let i = 0; i < cluster.length; ++i) {
        dataTable.getRow(cluster[i], dataRow);

        for (let j = 0; j < keys.length; ++j) {
            const key = keys[j];
            row[key] += dataRow[key];
        }
    }

    if (cluster.length > 0) {
        for (let i = 0; i < keys.length; ++i) {
            row[keys[i]] /= cluster.length;
        }
    }
};

const groupLabels = (labels: Uint32Array, k: number): number[][] => {
    const clusters: number[][] = [];

    for (let i = 0; i < k; ++i) {
        clusters[i] = [];
    }

    for (let i = 0; i < labels.length; ++i) {
        clusters[labels[i]].push(i);
    }

    return clusters;
};

type KMeansResult = {
    centroids: DataTable;
    labels: Uint32Array;
};

type ProgressCallback = (progress: number) => void;

/**
 * Perform k-means clustering using WebGPU compute shaders.
 *
 * @param points - DataTable of points to cluster
 * @param k - Number of clusters
 * @param iterations - Number of iterations to run
 * @param device - WebGPU graphics device
 * @param onProgress - Optional callback for progress updates (0-100)
 * @returns Centroids and cluster assignments
 */
const kmeans = async (
    points: DataTable,
    k: number,
    iterations: number,
    device: WebgpuGraphicsDevice,
    onProgress?: ProgressCallback
): Promise<KMeansResult> => {
    // too few data points
    if (points.numRows < k) {
        return {
            centroids: points.clone(),
            labels: new Uint32Array(points.numRows).map((_, i) => i)
        };
    }

    const row: Record<string, number> = {};

    // construct centroids data table and assign initial values
    const centroids = new DataTable(points.columns.map(c => new Column(c.name, new Float32Array(k))));
    if (points.numColumns === 1) {
        initializeCentroids1D(points, centroids);
    } else {
        initializeCentroids(points, centroids, row);
    }

    const gpuClustering = new GpuClustering(device, points.numColumns, k);
    const labels = new Uint32Array(points.numRows);

    let converged = false;
    let steps = 0;

    while (!converged) {
        await gpuClustering.execute(points, centroids, labels);

        // calculate the new centroid positions
        const groups = groupLabels(labels, k);
        for (let i = 0; i < centroids.numRows; ++i) {
            if (groups[i].length === 0) {
                // re-seed this centroid to a random point to avoid zero vector
                const idx = Math.floor(Math.random() * points.numRows);
                points.getRow(idx, row);
                centroids.setRow(i, row);
            } else {
                calcAverage(points, groups[i], row);
                centroids.setRow(i, row);
            }
        }

        steps++;
        onProgress?.(steps / iterations * 100);

        if (steps >= iterations) {
            converged = true;
        }
    }

    gpuClustering.destroy();

    return { centroids, labels };
};

/**
 * Cluster a multi-column DataTable into 256 clusters.
 * Returns labels (indices into 256 centroids) and the centroid codebook.
 *
 * @param dataTable - DataTable with multiple columns to cluster
 * @param iterations - Number of k-means iterations
 * @param device - WebGPU graphics device
 * @param onProgress - Optional callback for progress updates (0-100)
 * @returns Labels DataTable with same shape as input, and centroids array
 */
const cluster1d = async (
    dataTable: DataTable,
    iterations: number,
    device: WebgpuGraphicsDevice,
    onProgress?: ProgressCallback
): Promise<{ centroids: DataTable; labels: DataTable }> => {
    const { numColumns, numRows } = dataTable;

    // construct 1d points from the columns of data
    const data = new Float32Array(numRows * numColumns);
    for (let i = 0; i < numColumns; ++i) {
        data.set(dataTable.getColumn(i).data as Float32Array, i * numRows);
    }

    const src = new DataTable([new Column('data', data)]);

    const { centroids, labels } = await kmeans(src, 256, iterations, device, onProgress);

    // order centroids smallest to largest
    const centroidsData = centroids.getColumn(0).data as Float32Array;
    const order = Array.from(centroidsData).map((_, i) => i);
    order.sort((a, b) => centroidsData[a] - centroidsData[b]);

    // reorder centroids
    const tmp = centroidsData.slice();
    for (let i = 0; i < order.length; ++i) {
        centroidsData[i] = tmp[order[i]];
    }

    const invOrder: number[] = [];
    for (let i = 0; i < order.length; ++i) {
        invOrder[order[i]] = i;
    }

    // reorder labels
    for (let i = 0; i < labels.length; i++) {
        labels[i] = invOrder[labels[i]];
    }

    const result = new DataTable(dataTable.columnNames.map(name => new Column(name, new Uint8Array(numRows))));
    for (let i = 0; i < numColumns; ++i) {
        (result.getColumn(i).data as Uint8Array).set(labels.subarray(i * numRows, (i + 1) * numRows));
    }

    return {
        centroids,
        labels: result
    };
};

export { kmeans, cluster1d, KMeansResult, ProgressCallback };
