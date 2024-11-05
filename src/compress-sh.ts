// use median cut to create groups of n-dimensional data
// data is an array of arrays, each inner array is a point in n-dimensional space
const groupData = (points: number[][], numGroups: number): number[][][] => {
    // not enough data to split further, return each point in its own group
    if (points.length <= numGroups) {
        return points.map(x => [x]);
    }

    const makeGroup = (points: number[][]) => {
        // calculate bounding box
        const mins = [];
        const maxs = [];
        for (let j = 0; j < points[0].length; ++j) {
            mins[j] = maxs[j] = points[0][j];
        }

        for (let j = 1; j < points.length; ++j) {
            const point = points[j];
            for (let k = 0; k < point.length; ++k) {
                mins[k] = Math.min(mins[k], point[k]);
                maxs[k] = Math.max(maxs[k], point[k]);
            }
        }

        return { points, mins, maxs };
    }

    const groups = [makeGroup(points)];

    // during each iteration find the group with the largest bounding box
    // dimension and split it in half along that dimension
    while (groups.length < numGroups) {
        let largestValue = -Infinity;
        let largestSplit = -1;
        let largestDimension = -1;
        let largestGroup = -1;

        // search for group with largest bounding box dimension
        for (let i = 0; i < groups.length; ++i) {
            const { points, mins, maxs } = groups[i];

            // won't be considered for splitting
            if (points.length === 1) {
                continue;
            }

            // look through dimensions for the largest
            for (let j = 0; j < mins.length; ++j) {
                const diff = maxs[j] - mins[j];
                if (diff > largestValue) {
                    largestValue = diff;
                    largestSplit = (maxs[j] + mins[j]) * 0.5;
                    largestDimension = j;
                    largestGroup = i;
                }
            }
        }

        if (largestGroup === -1) {
            break;
        }

        // split the largest group by the largest dimension
        const points = groups[largestGroup].points;
        const left = [];
        const right = [];
        for (let i = 0; i < points.length; ++i) {
            if (points[i][largestDimension] < largestSplit) {
                left.push(points[i]);
            } else {
                right.push(points[i]);
            }
        }

        // replace the largest group with the two new groups
        groups.splice(largestGroup, 1);
        groups.push(makeGroup(left));
        groups.push(makeGroup(right));
    }

    return groups.map(x => x.points);
};

// calculate the average of the set of points
const average = (points: number[][]) => {
    const avg: number[] = [];
    for (let i = 0; i < points[0].length; ++i) {
        avg[i] = 0;
    }

    for (let i = 0; i < points.length; ++i) {
        const point = points[i];
        for (let j = 0; j < point.length; ++j) {
            avg[j] += point[j];
        }
    }

    for (let i = 0; i < avg.length; ++i) {
        avg[i] /= points.length;
    }

    return avg;
};

const compressSH = (src: number[][], numSplats: number) => {
    // group band 1
    const band1: number[][] = [];
    const band1Indices = new Map<number[], number>();
    for (let i = 0; i < numSplats; ++i) {
        const a = [src[0][i], src[1][i], src[2][i]];
        const b = [src[15][i], src[16][i], src[17][i]];
        const c = [src[30][i], src[31][i], src[32][i]];
        band1.push(a, b, c);
        band1Indices.set(a, i * 3 + 0);
        band1Indices.set(b, i * 3 + 1);
        band1Indices.set(c, i * 3 + 2);
    }

    // group band 2
    const band2: number[][] = [];
    const band2Indices = new Map<number[], number>();
    for (let i = 0; i < numSplats; ++i) {
        const a = [src[3][i], src[4][i], src[5][i], src[6][i], src[7][i]];
        const b = [src[18][i], src[19][i], src[20][i], src[21][i], src[22][i]];
        const c = [src[33][i], src[34][i], src[35][i], src[36][i], src[37][i]];
        band2.push(a, b, c);
        band2Indices.set(a, i * 3 + 0);
        band2Indices.set(b, i * 3 + 1);
        band2Indices.set(c, i * 3 + 2);
    }

    // group band 3
    const band3: number[][] = [];
    const band3Indices = new Map<number[], number>();
    for (let i = 0; i < numSplats; ++i) {
        const a = [src[8][i], src[9][i], src[10][i], src[11][i], src[12][i], src[13][i], src[14][i]];
        const b = [src[23][i], src[24][i], src[25][i], src[26][i], src[27][i], src[28][i], src[29][i]];
        const c = [src[38][i], src[39][i], src[40][i], src[41][i], src[42][i], src[43][i], src[44][i]];
        band3.push(a, b, c);
        band3Indices.set(a, i * 3 + 0);
        band3Indices.set(b, i * 3 + 1);
        band3Indices.set(c, i * 3 + 2);
    }

    // create band groups
    const band1Groups = groupData(band1, 256);      // 8
    const band2Groups = groupData(band2, 1024);     // 10
    const band3Groups = groupData(band3, 4096);     // 12

    // uncompress band 1
    for (let i = 0; i < band1Groups.length; ++i) {
        const group = band1Groups[i];
        const palette = average(group);
        for (let j = 0; j < group.length; ++j) {
            const index = band1Indices.get(group[j]);
            const splat = index / 3;
            const prop = (index % 3) * 15;
            for (let k = 0; k < palette.length; ++k) {
                src[prop + k][splat] = palette[k];
            }
        }
    }

    // uncompress band 2
    for (let i = 0; i < band2Groups.length; ++i) {
        const group = band2Groups[i];
        const palette = average(group);
        for (let j = 0; j < group.length; ++j) {
            const index = band2Indices.get(group[j]);
            const splat = index / 3;
            const prop = 3 + (index % 3) * 15;
            for (let k = 0; k < palette.length; ++k) {
                src[prop + k][splat] = palette[k];
            }
        }
    }

    // uncompress band 3
    for (let i = 0; i < band3Groups.length; ++i) {
        const group = band3Groups[i];
        const palette = average(group);
        for (let j = 0; j < group.length; ++j) {
            const index = band3Indices.get(group[j]);
            const splat = index / 3;
            const prop = 8 + (index % 3) * 15;
            for (let k = 0; k < palette.length; ++k) {
                src[prop + k][splat] = palette[k];
            }
        }
    }
}

export { compressSH };
