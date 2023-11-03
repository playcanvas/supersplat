import { SplatData } from '../submodules/model-viewer/src/splat/splat-data';

const deletedOpacity = -1000;

// build a splat index based on a boolean predicate
const buildIndex = (splatData: SplatData, pred: (i: number) => boolean) => {
    let numSplats = 0;
    for (let i = 0; i < splatData.numSplats; ++i) {
        if (pred(i)) numSplats++;
    }

    const result = new Uint32Array(numSplats);
    let idx = 0;
    for (let i = 0; i < splatData.numSplats; ++i) {
        if (pred(i)) {
            result[idx++] = i;
        }
    }

    return result;
};

class DeleteSelectionEditOp {
    name = 'deleteSelection';
    splatData: SplatData;
    indices: Uint32Array;
    opacity: Float32Array;

    constructor(splatData: SplatData) {
        const selection = splatData.getProp('selection');
        const opacity = splatData.getProp('opacity');
        const indices = buildIndex(splatData, (i) => selection[i] > 0);

        this.splatData = splatData;
        this.indices = indices;
        this.opacity = new Float32Array(indices.length);

        // backup opacity values
        for (let i = 0; i < indices.length; ++i) {
            this.opacity[i] = opacity[indices[i]];
        }
    }

    do() {
        const opacity = this.splatData.getProp('opacity');
        for (let i = 0; i < this.indices.length; ++i) {
            opacity[this.indices[i]] = deletedOpacity;
        }
    }

    undo() {
        const opacity = this.splatData.getProp('opacity');
        for (let i = 0; i < this.indices.length; ++i) {
            opacity[this.indices[i]] = this.opacity[i];
        }
    }

    destroy() {
        this.splatData = null;
        this.indices = null;
        this.opacity = null;
    }
}

class ResetEditOp {
    name = 'reset';
    splatData: SplatData;
    indices: Uint32Array;
    opacity: Float32Array;

    constructor(splatData: SplatData) {
        const opacity = splatData.getProp('opacity');
        const opacityOrig = splatData.getProp('opacityOrig');
        const indices = buildIndex(splatData, (i) => opacity[i] !== opacityOrig[i]);

        this.splatData = splatData;
        this.indices = indices;
        this.opacity = new Float32Array(indices.length);

        for (let i = 0; i < indices.length; ++i) {
            this.opacity[i] = opacity[indices[i]];
        }
    }

    do() {
        const opacity = this.splatData.getProp('opacity');
        const opacityOrig = this.splatData.getProp('opacityOrig');
        for (let i = 0; i < this.indices.length; ++i) {
            const idx = this.indices[i];
            opacity[idx] = opacityOrig[idx];
        }
    }

    undo() {
        const opacity = this.splatData.getProp('opacity');
        for (let i = 0; i < this.indices.length; ++i) {
            opacity[this.indices[i]] = this.opacity[i];
        }
    }

    destroy() {
        this.splatData = null;
        this.indices = null;
        this.opacity = null;
    }
}

export {
    deletedOpacity,
    DeleteSelectionEditOp,
    ResetEditOp
};
