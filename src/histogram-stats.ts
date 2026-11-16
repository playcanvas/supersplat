const PERCENTILES = [1, 5, 25, 50, 75, 95, 99];

type HistogramStats = {
    count: number;
    mean: number;
    percentiles: Record<string, number>;
};

// Summary statistics from equal-width bins over [min, max]. Values are taken
// to be spread evenly within a bin, so results are accurate to one bin width.
const histogramStats = (counts: ArrayLike<number>, min: number, max: number): HistogramStats | null => {
    let count = 0;
    for (let i = 0; i < counts.length; i++) count += counts[i];
    if (!count) return null;
    const width = (max - min) / counts.length;
    let sum = 0;
    for (let i = 0; i < counts.length; i++) sum += counts[i] * (min + (i + 0.5) * width);
    const percentiles: Record<string, number> = {};
    let bin = 0;
    let below = 0;
    for (const p of PERCENTILES) {
        const target = (count * p) / 100;
        while (bin < counts.length - 1 && below + counts[bin] < target) below += counts[bin++];
        const within = counts[bin] ? (target - below) / counts[bin] : 0;
        percentiles[`p${p}`] = min + (bin + Math.min(1, Math.max(0, within))) * width;
    }
    return { count, mean: sum / count, percentiles };
};

// Merge equal-width bins down to `bins` (a divisor of the input length).
const mergeBins = (counts: ArrayLike<number>, bins: number) => {
    const out = new Array(bins).fill(0);
    const step = counts.length / bins;
    for (let i = 0; i < counts.length; i++) out[Math.floor(i / step)] += counts[i];
    return out;
};

export { histogramStats, mergeBins };
export type { HistogramStats };
