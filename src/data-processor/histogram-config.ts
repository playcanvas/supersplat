// shared sizing constants for histogram and per-splat-mask GPU passes.
// keeping them in one place stops calc-histogram, select-by-range, intersect,
// and the histogram shaders from drifting independently.

// histogram tile reduction grid: tile shader writes a GRID_DIM x GRID_DIM
// texture, the reduce shader collapses it to 1x1. the histogram shaders
// hardcode MAX_GRID_DIM=64 as the unrolled loop bound; if GRID_DIM ever
// exceeds 64 the shader bound must be raised alongside it.
const GRID_DIM = 64;

// default bin count for histogram results when the caller does not override.
const NUM_BINS = 256;

// per-splat mask packing: each RGBA8 output texel carries 4 splats. width is
// derived from the source transformA texture width via this helper so all
// callers (Intersect, SelectByRange) agree on layout.
const packedMaskWidth = (sourceWidth: number): number => {
    return Math.max(1, Math.floor(sourceWidth / 2));
};

const packedMaskHeight = (packedWidth: number, numSplats: number): number => {
    return Math.ceil(numSplats / (packedWidth * 4));
};

export { GRID_DIM, NUM_BINS, packedMaskWidth, packedMaskHeight };
