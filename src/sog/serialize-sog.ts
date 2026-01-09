/**
 * SOG format serialization.
 * Port of splat-transform's write-sog.ts adapted for browser environment.
 */

import { WebgpuGraphicsDevice } from 'playcanvas';

import { Column, DataTable } from './data-table';
import { getGpuDevice } from './gpu-device';
import { cluster1d, kmeans } from './k-means';
import { generateMortonIndices } from './morton-order';
import { encodeWebP } from './webp-encoder';
import { version } from '../../package.json';
import { Writer } from '../serialize/writer';
import { ZipWriter } from '../serialize/zip-writer';
import { Splat } from '../splat';

// SH coefficient names
const shNames = new Array(45).fill('').map((_, i) => `f_rest_${i}`);

// Sigmoid function
const sigmoid = (v: number) => 1 / (1 + Math.exp(-v));

// Log transform for position encoding
const logTransform = (value: number) => {
    return Math.sign(value) * Math.log(Math.abs(value) + 1);
};

/**
 * Calculate min/max values for columns.
 */
const calcMinMax = (dataTable: DataTable, columnNames: string[], indices: Uint32Array) => {
    const columns = columnNames.map(name => dataTable.getColumnByName(name)!);
    const minMax = columnNames.map(() => [Infinity, -Infinity]);
    const row: Record<string, number> = {};

    for (let i = 0; i < indices.length; ++i) {
        dataTable.getRow(indices[i], row, columns);

        for (let j = 0; j < columnNames.length; ++j) {
            const value = row[columnNames[j]];
            if (value < minMax[j][0]) minMax[j][0] = value;
            if (value > minMax[j][1]) minMax[j][1] = value;
        }
    }

    return minMax;
};

type SogSerializeOptions = {
    iterations: number;
    maxSHBands?: number;
};

/**
 * Extract splat data into a DataTable format.
 */
const extractSplatData = (
    splats: Splat[],
    getSingleSplat: (splat: Splat, index: number) => Record<string, number>,
    filter: (splat: Splat, index: number) => boolean,
    memberNames: string[]
): { dataTable: DataTable; count: number } => {
    // Count total gaussians
    let totalCount = 0;
    for (const splat of splats) {
        for (let i = 0; i < splat.splatData.numSplats; ++i) {
            if (filter(splat, i)) {
                totalCount++;
            }
        }
    }

    if (totalCount === 0) {
        throw new Error('No gaussians to export');
    }

    // Create columns
    const columns = memberNames.map(name => new Column(name, new Float32Array(totalCount)));
    const dataTable = new DataTable(columns);

    // Extract data
    let idx = 0;
    for (const splat of splats) {
        for (let i = 0; i < splat.splatData.numSplats; ++i) {
            if (!filter(splat, i)) continue;

            const data = getSingleSplat(splat, i);
            for (let j = 0; j < memberNames.length; ++j) {
                columns[j].data[idx] = data[memberNames[j]] ?? 0;
            }
            idx++;
        }
    }

    return { dataTable, count: totalCount };
};

/**
 * Write means (positions) as two 16-bit WebP textures.
 */
const writeMeans = async (
    dataTable: DataTable,
    indices: Uint32Array,
    width: number,
    height: number
): Promise<{ meansL: Uint8Array; meansU: Uint8Array; mins: number[]; maxs: number[] }> => {
    const meansL = new Uint8Array(width * height * 4);
    const meansU = new Uint8Array(width * height * 4);
    const meansNames = ['x', 'y', 'z'];
    const meansMinMax = calcMinMax(dataTable, meansNames, indices).map(v => v.map(logTransform));
    const meansColumns = meansNames.map(name => dataTable.getColumnByName(name)!);
    const row: Record<string, number> = {};

    for (let i = 0; i < indices.length; ++i) {
        dataTable.getRow(indices[i], row, meansColumns);

        const x = 65535 * (logTransform(row.x) - meansMinMax[0][0]) / (meansMinMax[0][1] - meansMinMax[0][0] || 1);
        const y = 65535 * (logTransform(row.y) - meansMinMax[1][0]) / (meansMinMax[1][1] - meansMinMax[1][0] || 1);
        const z = 65535 * (logTransform(row.z) - meansMinMax[2][0]) / (meansMinMax[2][1] - meansMinMax[2][0] || 1);

        const ti = i;

        meansL[ti * 4] = x & 0xff;
        meansL[ti * 4 + 1] = y & 0xff;
        meansL[ti * 4 + 2] = z & 0xff;
        meansL[ti * 4 + 3] = 0xff;

        meansU[ti * 4] = (x >> 8) & 0xff;
        meansU[ti * 4 + 1] = (y >> 8) & 0xff;
        meansU[ti * 4 + 2] = (z >> 8) & 0xff;
        meansU[ti * 4 + 3] = 0xff;
    }

    return {
        meansL: await encodeWebP(meansL, width, height),
        meansU: await encodeWebP(meansU, width, height),
        mins: meansMinMax.map(v => v[0]),
        maxs: meansMinMax.map(v => v[1])
    };
};

/**
 * Write quaternions as a WebP texture.
 */
const writeQuaternions = async (
    dataTable: DataTable,
    indices: Uint32Array,
    width: number,
    height: number
): Promise<Uint8Array> => {
    const quats = new Uint8Array(width * height * 4);
    const quatNames = ['rot_0', 'rot_1', 'rot_2', 'rot_3'];
    const quatColumns = quatNames.map(name => dataTable.getColumnByName(name)!);
    const row: Record<string, number> = {};
    const q = [0, 0, 0, 0];

    for (let i = 0; i < indices.length; ++i) {
        dataTable.getRow(indices[i], row, quatColumns);

        q[0] = row.rot_0;
        q[1] = row.rot_1;
        q[2] = row.rot_2;
        q[3] = row.rot_3;

        const l = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);

        // normalize
        for (let j = 0; j < 4; ++j) {
            q[j] /= l;
        }

        // find max component
        let maxComp = 0;
        for (let j = 1; j < 4; ++j) {
            if (Math.abs(q[j]) > Math.abs(q[maxComp])) {
                maxComp = j;
            }
        }

        // invert if max component is negative
        if (q[maxComp] < 0) {
            for (let j = 0; j < 4; ++j) {
                q[j] *= -1;
            }
        }

        // scale by sqrt(2) to fit in [-1, 1] range
        const sqrt2 = Math.sqrt(2);
        for (let j = 0; j < 4; ++j) {
            q[j] *= sqrt2;
        }

        const idx = [
            [1, 2, 3],
            [0, 2, 3],
            [0, 1, 3],
            [0, 1, 2]
        ][maxComp];

        const ti = i;

        quats[ti * 4] = 255 * (q[idx[0]] * 0.5 + 0.5);
        quats[ti * 4 + 1] = 255 * (q[idx[1]] * 0.5 + 0.5);
        quats[ti * 4 + 2] = 255 * (q[idx[2]] * 0.5 + 0.5);
        quats[ti * 4 + 3] = 252 + maxComp;
    }

    return await encodeWebP(quats, width, height);
};

/**
 * Write scales using k-means clustering.
 */
const writeScales = async (
    dataTable: DataTable,
    indices: Uint32Array,
    width: number,
    height: number,
    iterations: number,
    device: WebgpuGraphicsDevice
): Promise<{ webp: Uint8Array; codebook: number[] }> => {
    // Create a permuted table with only the indexed rows
    const scaleNames = ['scale_0', 'scale_1', 'scale_2'];
    const scaleColumns = scaleNames.map((name) => {
        const src = dataTable.getColumnByName(name)!.data;
        const dst = new Float32Array(indices.length);
        for (let i = 0; i < indices.length; ++i) {
            dst[i] = src[indices[i]];
        }
        return new Column(name, dst);
    });
    const scaleTable = new DataTable(scaleColumns);

    const scaleData = await cluster1d(scaleTable, iterations, device);

    // Write labels to texture
    const data = new Uint8Array(width * height * 4);
    const columns = scaleData.labels.columns.map(c => c.data);
    const numColumns = columns.length;

    for (let i = 0; i < indices.length; ++i) {
        data[i * 4 + 0] = columns[0][i];
        data[i * 4 + 1] = numColumns > 1 ? columns[1][i] : 0;
        data[i * 4 + 2] = numColumns > 2 ? columns[2][i] : 0;
        data[i * 4 + 3] = 255;
    }

    return {
        webp: await encodeWebP(data, width, height),
        codebook: Array.from(scaleData.centroids.getColumn(0).data as Float32Array)
    };
};

/**
 * Write colors and opacity using k-means clustering.
 */
const writeColors = async (
    dataTable: DataTable,
    indices: Uint32Array,
    width: number,
    height: number,
    iterations: number,
    device: WebgpuGraphicsDevice
): Promise<{ webp: Uint8Array; codebook: number[] }> => {
    // Create a permuted table with only the indexed rows
    const colorNames = ['f_dc_0', 'f_dc_1', 'f_dc_2'];
    const colorColumns = colorNames.map((name) => {
        const src = dataTable.getColumnByName(name)!.data;
        const dst = new Float32Array(indices.length);
        for (let i = 0; i < indices.length; ++i) {
            dst[i] = src[indices[i]];
        }
        return new Column(name, dst);
    });
    const colorTable = new DataTable(colorColumns);

    const colorData = await cluster1d(colorTable, iterations, device);

    // Generate and store sigmoid(opacity) [0..1]
    const opacity = dataTable.getColumnByName('opacity')!.data;
    const opacityData = new Uint8Array(indices.length);
    for (let i = 0; i < indices.length; ++i) {
        opacityData[i] = Math.max(0, Math.min(255, sigmoid(opacity[indices[i]]) * 255));
    }
    colorData.labels.addColumn(new Column('opacity', opacityData));

    // Write labels to texture
    const data = new Uint8Array(width * height * 4);
    const columns = colorData.labels.columns.map(c => c.data);

    for (let i = 0; i < indices.length; ++i) {
        data[i * 4 + 0] = columns[0][i];
        data[i * 4 + 1] = columns[1][i];
        data[i * 4 + 2] = columns[2][i];
        data[i * 4 + 3] = columns[3][i]; // opacity
    }

    return {
        webp: await encodeWebP(data, width, height),
        codebook: Array.from(colorData.centroids.getColumn(0).data as Float32Array)
    };
};

/**
 * Write spherical harmonics using k-means clustering.
 */
const writeSH = async (
    dataTable: DataTable,
    indices: Uint32Array,
    width: number,
    height: number,
    shBands: number,
    iterations: number,
    device: WebgpuGraphicsDevice
): Promise<{ count: number; bands: number; codebook: number[]; centroidsWebp: Uint8Array; labelsWebp: Uint8Array } | null> => {
    if (shBands === 0) return null;

    const shCoeffs = [0, 3, 8, 15][shBands];
    const shColumnNames = shNames.slice(0, shCoeffs * 3);

    // Check if all SH columns exist
    for (const name of shColumnNames) {
        if (!dataTable.hasColumn(name)) {
            return null;
        }
    }

    // Create SH table with indexed rows
    const shColumns = shColumnNames.map((name) => {
        const src = dataTable.getColumnByName(name)!.data;
        const dst = new Float32Array(indices.length);
        for (let i = 0; i < indices.length; ++i) {
            dst[i] = src[indices[i]];
        }
        return new Column(name, dst);
    });
    const shDataTable = new DataTable(shColumns);

    const paletteSize = Math.min(64, 2 ** Math.floor(Math.log2(indices.length / 1024))) * 1024;

    // Calculate kmeans
    const { centroids, labels } = await kmeans(shDataTable, paletteSize, iterations, device);

    // Construct a codebook for all spherical harmonic coefficients
    const codebook = await cluster1d(centroids, iterations, device);

    // Write centroids
    const centroidsWidth = 64 * shCoeffs;
    const centroidsHeight = Math.ceil(centroids.numRows / 64);
    const centroidsBuf = new Uint8Array(centroidsWidth * centroidsHeight * 4);
    const centroidsRow: Record<string, number> = {};

    for (let i = 0; i < centroids.numRows; ++i) {
        codebook.labels.getRow(i, centroidsRow);

        for (let j = 0; j < shCoeffs; ++j) {
            const x = centroidsRow[shColumnNames[shCoeffs * 0 + j]];
            const y = centroidsRow[shColumnNames[shCoeffs * 1 + j]];
            const z = centroidsRow[shColumnNames[shCoeffs * 2 + j]];

            centroidsBuf[i * shCoeffs * 4 + j * 4 + 0] = x;
            centroidsBuf[i * shCoeffs * 4 + j * 4 + 1] = y;
            centroidsBuf[i * shCoeffs * 4 + j * 4 + 2] = z;
            centroidsBuf[i * shCoeffs * 4 + j * 4 + 3] = 0xff;
        }
    }

    // Write labels
    const labelsBuf = new Uint8Array(width * height * 4);
    for (let i = 0; i < indices.length; ++i) {
        const label = labels[i];

        labelsBuf[i * 4 + 0] = 0xff & label;
        labelsBuf[i * 4 + 1] = 0xff & (label >> 8);
        labelsBuf[i * 4 + 2] = 0;
        labelsBuf[i * 4 + 3] = 0xff;
    }

    return {
        count: paletteSize,
        bands: shBands,
        codebook: Array.from(codebook.centroids.getColumn(0).data as Float32Array),
        centroidsWebp: await encodeWebP(centroidsBuf, centroidsWidth, centroidsHeight),
        labelsWebp: await encodeWebP(labelsBuf, width, height)
    };
};

/**
 * Serialize splats to SOG format.
 *
 * @param splats - Array of Splat objects to serialize
 * @param getSingleSplat - Function to extract data for a single splat
 * @param filter - Function to filter which splats to include
 * @param options - Serialization options
 * @param writer - Output writer
 */
const serializeSog = async (
    splats: Splat[],
    getSingleSplat: (splat: Splat, index: number) => Record<string, number>,
    filter: (splat: Splat, index: number) => boolean,
    options: SogSerializeOptions,
    writer: Writer
): Promise<void> => {
    const { iterations, maxSHBands = 3 } = options;

    // Determine which members to extract
    const baseMembers = [
        'x', 'y', 'z',
        'scale_0', 'scale_1', 'scale_2',
        'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity',
        'rot_0', 'rot_1', 'rot_2', 'rot_3'
    ];

    // Add SH members based on maxSHBands
    const shCoeffs = [0, 3, 8, 15][maxSHBands];
    const memberNames = [...baseMembers, ...shNames.slice(0, shCoeffs * 3)];

    // Extract data
    const { dataTable, count } = extractSplatData(splats, getSingleSplat, filter, memberNames);

    // Calculate texture dimensions
    const width = Math.ceil(Math.sqrt(count) / 4) * 4;
    const height = Math.ceil(count / width / 4) * 4;

    // Generate morton-ordered indices
    const indices = generateMortonIndices(dataTable);

    // Get GPU device
    const gpuDevice = await getGpuDevice();
    const device = gpuDevice.device;

    // Create zip writer
    const zipWriter = new ZipWriter(writer);

    // Write means (positions)
    const means = await writeMeans(dataTable, indices, width, height);
    await zipWriter.file('means_l.webp', means.meansL);
    await zipWriter.file('means_u.webp', means.meansU);

    // Write quaternions
    const quatsWebp = await writeQuaternions(dataTable, indices, width, height);
    await zipWriter.file('quats.webp', quatsWebp);

    // Write scales
    const scales = await writeScales(dataTable, indices, width, height, iterations, device);
    await zipWriter.file('scales.webp', scales.webp);

    // Write colors
    const colors = await writeColors(dataTable, indices, width, height, iterations, device);
    await zipWriter.file('sh0.webp', colors.webp);

    // Determine SH bands present in data
    const dataSHBands = (() => {
        const idx = shNames.findIndex(v => !dataTable.hasColumn(v));
        return { 9: 1, 24: 2, [-1]: 3 }[idx] ?? 0;
    })();
    const outputSHBands = Math.min(dataSHBands, maxSHBands);

    // Write SH if present
    const shN = outputSHBands > 0 ?
        await writeSH(dataTable, indices, width, height, outputSHBands, iterations, device) :
        null;

    if (shN) {
        await zipWriter.file('shN_centroids.webp', shN.centroidsWebp);
        await zipWriter.file('shN_labels.webp', shN.labelsWebp);
    }

    // Construct meta.json
    const meta: Record<string, unknown> = {
        version: 2,
        asset: {
            generator: `SuperSplat v${version}`
        },
        count,
        means: {
            mins: means.mins,
            maxs: means.maxs,
            files: ['means_l.webp', 'means_u.webp']
        },
        scales: {
            codebook: scales.codebook,
            files: ['scales.webp']
        },
        quats: {
            files: ['quats.webp']
        },
        sh0: {
            codebook: colors.codebook,
            files: ['sh0.webp']
        }
    };

    if (shN) {
        meta.shN = {
            count: shN.count,
            bands: shN.bands,
            codebook: shN.codebook,
            files: ['shN_centroids.webp', 'shN_labels.webp']
        };
    }

    const metaJson = new TextEncoder().encode(JSON.stringify(meta));
    await zipWriter.file('meta.json', metaJson);

    // Close zip
    await zipWriter.close();
};

export { serializeSog, SogSerializeOptions };
