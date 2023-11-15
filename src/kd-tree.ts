
interface KdTreeNode {
    index: number;
    left?: KdTreeNode;
    right?: KdTreeNode;
};

class KdTree {
    data: Float32Array[];
    root: KdTreeNode;

    constructor(x: Float32Array, y: Float32Array, z: Float32Array) {
        const indices = new Uint32Array(x.length);
        indices.forEach((v, i) => indices[i] = i);

        this.data = [x, y, z];
        this.root = this.build(indices, 0);
    }

    findNearest(x: number, y: number, z: number, filterFunc?: (index: number) => boolean) {
        const search = [x, y, z];

        const calcDistance = (index: number) => {
            const xd = this.data[0][index] - search[0];
            const yd = this.data[1][index] - search[1];
            const zd = this.data[2][index] - search[2];
            return xd * xd + yd * yd + zd * zd;
        };

        let mind = Infinity;
        let mini = -1;
        let cnt = 0;

        const recurse = (node: KdTreeNode, depth: number) => {
            const axis = depth % 3;
            const distance = search[axis] - (this.data[axis])[node.index];
            const next = (distance > 0) ? node.right : node.left;

            cnt++;

            if (next) {
                recurse(next, depth + 1);
            }

            // check index
            if (!filterFunc || filterFunc(node.index)) {
                const thisd = calcDistance(node.index);
                if (thisd < mind) {
                    mind = thisd;
                    mini = node.index;
                }
            }

            // check the other side
            if (distance * distance < mind) {
                const other = next === node.right ? node.left : node.right;
                if (other) {
                    recurse(other, depth + 1);
                }
            }
        };

        recurse(this.root, 0);

        return { index: mini, distanceSqr: mind, cnt };
    }

    private build(indices: Uint32Array, depth: number): KdTreeNode {
        const values = this.data[depth % 3];
        indices.sort((a, b) => values[a] - values[b]);

        let result;

        if (indices.length === 4) {
            result = {
                index: indices[1],
                left: {
                    index: indices[0]
                },
                right: this.build(indices.subarray(2), depth + 1)
            }
        } else if (indices.length === 3) {
            result = {
                index: indices[1],
                left: {
                    index: indices[0]
                },
                right: {
                    index: indices[2]
                }
            }
        } else if (indices.length === 2) {
            result = {
                index: indices[0],
                right: {
                    index: indices[1]
                }
            }
        } else {
            const mid = Math.floor(indices.length / 2);
            const index = indices[mid];
            const ldata = indices.subarray(0, mid);
            const rdata = indices.subarray(mid + 1);
            const left = this.build(ldata, depth + 1);
            const right = this.build(rdata, depth + 1);
            result = { index, left, right };
        }

        return result;
    }
}

export { KdTree };
