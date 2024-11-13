// stores n-dimensional point data
class Points {
    data: Float32Array;
    dimensions: number;
    averageData: Float32Array;

    constructor(numPoints: number, dimensions: number) {
        this.data = new Float32Array(numPoints * dimensions);
        this.dimensions = dimensions;
        this.averageData = new Float32Array(dimensions);
    }

    get numPoints() {
        return this.data.length / this.dimensions;
    }

    // calculate the average of the set of points indexes by indices
    average(indices: number[]) {
        const { averageData, data, dimensions } = this;

        for (let i = 0; i < dimensions; ++i) {
            averageData[i] = 0;
        }

        const numIndices = indices.length;
        for (let i = 0; i < numIndices; ++i) {
            const point = indices[i];
            for (let j = 0; j < dimensions; ++j) {
                averageData[j] += data[point * dimensions + j];
            }
        }

        for (let i = 0; i < dimensions; ++i) {
            averageData[i] /= numIndices;
        }

        return averageData;
    }
};

type Group = {
    left: number;
    right: number;
    largestDimension: number;
    largestValue: number;
    largestSplit: number;
};

// use median cut to create groups of n-dimensional data
const groupData = (points: Points, numGroups: number, epsilon = 1e-03): number[][] => {
    const { data, dimensions, numPoints } = points;

    // construct the index array, which will be grouped in-place
    const indices: number[] = [];
    for (let i = 0; i < numPoints; ++i) {
        indices.push(i);
    }

    // worker array for calculating min and max values for each dimension
    const mins: number[] = [];
    const maxs: number[] = [];
    for (let i = 0; i < dimensions; ++i) {
        mins.push(0);
        maxs.push(0);
    }

    const p = (i: number, d: number) => {
        return data[i * dimensions + d];
    };

    const calcGroupBounds = (group: Group) => {
        const { left, right } = group;

        group.largestDimension = -1;
        group.largestValue = -Infinity;
        group.largestSplit = -1;

        // recalculate largest dimension details
        if (group.right - group.left > 1) {
            for (let k = 0; k < dimensions; ++k) {
                mins[k] = maxs[k] = p(indices[left], k);
            }

            for (let j = left + 1; j < right; ++j) {
                for (let k = 0; k < dimensions; ++k) {
                    const value = p(indices[j], k);
                    mins[k] = Math.min(mins[k], value);
                    maxs[k] = Math.max(maxs[k], value);
                }
            }

            for (let k = 0; k < dimensions; ++k) {
                const diff = maxs[k] - mins[k];
                if (diff > group.largestValue) {
                    group.largestDimension = k;
                    group.largestValue = diff;
                    group.largestSplit = (maxs[k] + mins[k]) * 0.5;
                }
            }
        }

        return group;
    };

    const makeGroup = (left: number, right: number) => {
        return calcGroupBounds({ left, right, largestDimension: -1, largestValue: -1, largestSplit: -1 });
    };

    // split a single group into two using the provided dimension and value. returns the new group.
    const splitGroup = (group: Group, splitDimension: number, splitValue: number) => {
        const numPoints = group.right - group.left;
        let leftPtr = group.left;
        let rightPtr = group.right - 1;

        for (let i = 0; i < numPoints; ++i) {
            const value = p(indices[leftPtr], splitDimension);
            if (value < splitValue) {
                leftPtr++;
            } else {
                // swap to the right side
                const tmp = indices[rightPtr];
                indices[rightPtr] = indices[leftPtr];
                indices[leftPtr] = tmp;
                rightPtr--;
            }
        }

        const result = makeGroup(leftPtr, group.right);

        group.right = leftPtr;
        calcGroupBounds(group);

        return result;
    };

    // construct the initial group containing all points
    const groups: Group[] = [makeGroup(0, numPoints)];

    // during each iteration find the group with the largest bounding box
    // dimension and split it in half along that dimension
    while (groups.length < numGroups) {
        let largestGroup = -1;
        let largestValue = -Infinity;

        // search for group with largest bounding box dimension
        for (let i = 0; i < groups.length; ++i) {
            if (groups[i].largestValue > largestValue) {
                largestGroup = i;
                largestValue = groups[i].largestValue;
            }
        }

        // if no splitting groups were found, we're done
        if (largestGroup === -1) {
            break;
        }

        // if the largest dimension is small enough, we're done
        if (epsilon !== null && largestValue < epsilon) {
            break;
        }

        const g = groups[largestGroup];

        groups.push(splitGroup(g, g.largestDimension, g.largestSplit));
    }

    // convert group range to index array
    return groups.map((group) => indices.slice(group.left, group.right));
};

const shCompress = (src: number[][], numSplats: number, maxGroups: number, epsilon: number) => {
    const doBand1 = () => {
        // group band 1
        const band1 = new Points(numSplats * 3, 3);
        const { data } = band1;
        for (let i = 0; i < numSplats; ++i) {
            data.set([
                src[0][i], src[1][i], src[2][i],
                src[15][i], src[16][i], src[17][i],
                src[30][i], src[31][i], src[32][i]
            ], i * 9);
        }

        // create band groups
        const band1Groups = groupData(band1, maxGroups, epsilon);

        console.log(`band1: ${band1Groups.length} (${band1Groups.length * 4 * 3} bytes)`);

        // uncompress band 1
        for (let i = 0; i < band1Groups.length; ++i) {
            const group = band1Groups[i];
            const palette = band1.average(group);
            for (let j = 0; j < group.length; ++j) {
                const index = group[j];
                const splat = index / 3;
                const prop = (index % 3) * 15;
                for (let k = 0; k < palette.length; ++k) {
                    src[prop + k][splat] = palette[k];
                }
            }
        }
    };

    const doBand2 = () => {
        // group band 2
        const band2 = new Points(numSplats * 3, 5);
        const { data } = band2;
        for (let i = 0; i < numSplats; ++i) {
            data.set([
                src[3][i], src[4][i], src[5][i], src[6][i], src[7][i],
                src[18][i], src[19][i], src[20][i], src[21][i], src[22][i],
                src[33][i], src[34][i], src[35][i], src[36][i], src[37][i]
            ], i * 15);
        }

        const band2Groups = groupData(band2, maxGroups, epsilon);

        console.log(`band2: ${band2Groups.length} (${band2Groups.length * 4 * 5} bytes)`);

        // uncompress band 2
        for (let i = 0; i < band2Groups.length; ++i) {
            const group = band2Groups[i];
            const palette = band2.average(group);
            for (let j = 0; j < group.length; ++j) {
                const index = group[j];
                const splat = index / 3;
                const prop = 3 + (index % 3) * 15;
                for (let k = 0; k < palette.length; ++k) {
                    src[prop + k][splat] = palette[k];
                }
            }
        }
    };

    const doBand3 = () => {
        // group band 3
        const band3 = new Points(numSplats * 3, 7);
        const { data } = band3;
        for (let i = 0; i < numSplats; ++i) {
            data.set([
                src[8][i], src[9][i], src[10][i], src[11][i], src[12][i], src[13][i], src[14][i],
                src[23][i], src[24][i], src[25][i], src[26][i], src[27][i], src[28][i], src[29][i],
                src[38][i], src[39][i], src[40][i], src[41][i], src[42][i], src[43][i], src[44][i]
            ], i * 21);
        }

        const band3Groups = groupData(band3, maxGroups, epsilon);

        console.log(`band3: ${band3Groups.length} (${band3Groups.length * 4 * 7} bytes)`);

        // uncompress band 3
        for (let i = 0; i < band3Groups.length; ++i) {
            const group = band3Groups[i];
            const palette = band3.average(group);
            for (let j = 0; j < group.length; ++j) {
                const index = group[j];
                const splat = index / 3;
                const prop = 8 + (index % 3) * 15;
                for (let k = 0; k < palette.length; ++k) {
                    src[prop + k][splat] = palette[k];
                }
            }
        }
    };

    doBand1();
    doBand2();
    doBand3();
}

export { shCompress };
