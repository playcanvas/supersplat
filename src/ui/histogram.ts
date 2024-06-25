
class HistogramData {
    bins: Uint32Array;
    minValue: number;
    maxValue: number;

    constructor(numBins: number) {
        this.bins = new Uint32Array(numBins);
    }

    calc(data: Float32Array, transform: (v: number) => number) {
        // calculate min, max
        let min = transform(data[0]);
        let max = min;
        for (let i = 0; i < data.length; i++) {
            const v = transform(data[i]);
            if (v < min) min = v; else if (v > max) max = v;
        }

        // fill bins
        const bins = this.bins;
        for (let i = 0; i < bins.length; ++i) {
            bins[i] = 0;
        }

        for (let i = 0; i < data.length; i++) {
            const v = transform(data[i]);
            const bin = Math.min(bins.length - 1, Math.floor((v - min) / (max - min) * bins.length));
            bins[bin]++;
        }

        this.minValue = min;
        this.maxValue = max;
    }
}

class Histogram {
    root: HTMLElement;
    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D;
    histogram: HistogramData;
    pixelData: ImageData;
    minValue: number;
    maxValue: number;

    constructor(numBins: number, height: number) {
        const canvas = document.createElement('canvas');
        canvas.classList.add('histogram-canvas');
        canvas.width = numBins;
        canvas.height = height;
        canvas.style.width = `100%`;
        canvas.style.height = `100%`;

        const context = canvas.getContext('2d');
        context.globalCompositeOperation = 'copy';

        this.canvas = canvas;
        this.context = context;
        this.histogram = new HistogramData(numBins);
        this.pixelData = context.createImageData(canvas.width, canvas.height);

        this.canvas.addEventListener('mousemove', (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();

            const rect = this.canvas.getBoundingClientRect();
            const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const h = this.histogram;
            const bin = Math.min(h.bins.length - 1, Math.floor(x * h.bins.length));

            console.log(`bin: ${bin} value: ${h.bins[bin]}`);
        });
    }

    update(data: Float32Array, transform: (v: number) => number) {
        this.histogram.calc(data, transform);

        // convert bin values to log scale
        const bins = this.histogram.bins;
        const vals = [];
        for (let i = 0; i < bins.length; ++i) {
            vals[i] = Math.log(bins[i] + 1);
        }
        const valMax = Math.max(...vals);

        // draw histogram
        const canvas = this.canvas;
        const context = this.context;
        const pixelData = this.pixelData;
        const pixels = new Uint32Array(pixelData.data.buffer);

        let i = 0;
        for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < vals.length; x++) {
                if (vals[x] / valMax > (canvas.height - 1 - y) / canvas.height) {
                    pixels[i++] = 0xffffffff;
                } else {
                    pixels[i++] = 0xff000000;
                }
            }
        }

        context.putImageData(pixelData, 0, 0);
    }
}

export { Histogram };
