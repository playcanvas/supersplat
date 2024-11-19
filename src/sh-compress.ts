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
const groupPoints = (points: Points, numGroups: number, epsilon = 1e-03): number[][] => {
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

export { Points, groupPoints };
