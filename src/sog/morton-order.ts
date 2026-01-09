/**
 * Morton ordering (Z-order curve) for spatial coherence.
 * Sorts indices into morton order based on 3D positions.
 */

import { DataTable } from './data-table';

/**
 * Sort the provided indices into morton order based on x, y, z positions.
 *
 * @param dataTable - DataTable containing 'x', 'y', 'z' columns
 * @param indices - Array of indices to sort (modified in place)
 */
const sortMortonOrder = (dataTable: DataTable, indices: Uint32Array): void => {
    const cx = dataTable.getColumnByName('x')?.data;
    const cy = dataTable.getColumnByName('y')?.data;
    const cz = dataTable.getColumnByName('z')?.data;

    if (!cx || !cy || !cz) {
        throw new Error('DataTable must have x, y, z columns for morton ordering');
    }

    const generate = (indices: Uint32Array) => {
        // https://fgiesen.wordpress.com/2009/12/13/decoding-morton-codes/
        const encodeMorton3 = (x: number, y: number, z: number): number => {
            const Part1By2 = (x: number) => {
                x &= 0x000003ff;
                x = (x ^ (x << 16)) & 0xff0000ff;
                x = (x ^ (x << 8)) & 0x0300f00f;
                x = (x ^ (x << 4)) & 0x030c30c3;
                x = (x ^ (x << 2)) & 0x09249249;
                return x;
            };

            return (Part1By2(z) << 2) + (Part1By2(y) << 1) + Part1By2(x);
        };

        let mx: number | undefined;
        let my: number | undefined;
        let mz: number | undefined;
        let Mx: number | undefined;
        let My: number | undefined;
        let Mz: number | undefined;

        // calculate scene extents
        for (let i = 0; i < indices.length; ++i) {
            const ri = indices[i];
            const x = cx[ri];
            const y = cy[ri];
            const z = cz[ri];

            if (mx === undefined) {
                mx = Mx = x;
                my = My = y;
                mz = Mz = z;
            } else {
                if (x < mx) mx = x; else if (x > Mx!) Mx = x;
                if (y < my!) my = y; else if (y > My!) My = y;
                if (z < mz!) mz = z; else if (z > Mz!) Mz = z;
            }
        }

        if (mx === undefined) return;

        const xlen = Mx! - mx;
        const ylen = My! - my!;
        const zlen = Mz! - mz!;

        if (!isFinite(xlen) || !isFinite(ylen) || !isFinite(zlen)) {
            return;
        }

        // all points are identical
        if (xlen === 0 && ylen === 0 && zlen === 0) {
            return;
        }

        const xmul = (xlen === 0) ? 0 : 1024 / xlen;
        const ymul = (ylen === 0) ? 0 : 1024 / ylen;
        const zmul = (zlen === 0) ? 0 : 1024 / zlen;

        const morton = new Uint32Array(indices.length);
        for (let i = 0; i < indices.length; ++i) {
            const ri = indices[i];
            const x = cx[ri];
            const y = cy[ri];
            const z = cz[ri];

            const ix = Math.min(1023, (x - mx) * xmul) >>> 0;
            const iy = Math.min(1023, (y - my!) * ymul) >>> 0;
            const iz = Math.min(1023, (z - mz!) * zmul) >>> 0;

            morton[i] = encodeMorton3(ix, iy, iz);
        }

        // sort indices by morton code
        const order = Array.from(indices).map((_, i) => i);
        order.sort((a, b) => morton[a] - morton[b]);

        const tmpIndices = indices.slice();
        for (let i = 0; i < indices.length; ++i) {
            indices[i] = tmpIndices[order[i]];
        }

        // sort the largest buckets recursively
        let start = 0;
        let end = 1;
        while (start < indices.length) {
            while (end < indices.length && morton[order[end]] === morton[order[start]]) {
                ++end;
            }

            if (end - start > 256) {
                generate(indices.subarray(start, end));
            }

            start = end;
        }
    };

    generate(indices);
};

/**
 * Generate indices array for a DataTable sorted in morton order.
 *
 * @param dataTable - DataTable containing 'x', 'y', 'z' columns
 * @returns Sorted indices array
 */
const generateMortonIndices = (dataTable: DataTable): Uint32Array => {
    const result = new Uint32Array(dataTable.numRows);
    for (let i = 0; i < result.length; ++i) {
        result[i] = i;
    }
    sortMortonOrder(dataTable, result);
    return result;
};

export { sortMortonOrder, generateMortonIndices };
