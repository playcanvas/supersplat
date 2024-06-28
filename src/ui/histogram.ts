import { Events } from '../events';

class HistogramData {
    bins: Uint32Array;
    numValues: number;
    minValue: number;
    maxValue: number;

    constructor(numBins: number) {
        this.bins = new Uint32Array(numBins);
    }

    calc(count: number, value: (v: number) => number | undefined) {
        // clear bins
        const bins = this.bins;
        for (let i = 0; i < bins.length; ++i) {
            bins[i] = 0;
        }

        // calculate min, max
        let min, max, i;
        for (i = 0; i < count; i++) {
            const v = value(i);
            if (v !== undefined) {
                min = max = v;
                break;
            }
        }

        // no data
        if (i === count) {
            return;
        }

        // continue min/max calc
        for (; i < count; i++) {
            const v = value(i);
            if (v !== undefined) {
                if (v < min) min = v; else if (v > max) max = v;
            }
        }

        // fill bins
        for (let i = 0; i < count; i++) {
            const v = value(i);
            if (v !== undefined) {
                const n = min === max ? 0 : (v - min) / (max - min);
                const bin = Math.min(bins.length - 1, Math.floor(n * bins.length));
                bins[bin]++;
            }
        }
        this.numValues = bins.reduce((t, v) => t + v, 0);
        this.minValue = min;
        this.maxValue = max;
    }

    bucketValue(bucket: number) {
        return this.minValue + bucket * this.bucketSize;
    }

    get bucketSize() {
        return (this.maxValue - this.minValue) / this.bins.length;
    }

    valueToBucket(value: number) {
        const n = this.minValue === this.maxValue ? 0 : (value - this.minValue) / (this.maxValue - this.minValue);
        return Math.min(this.bins.length - 1, Math.floor(n * this.bins.length));
    }
}

class Histogram {
    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D;
    histogram: HistogramData;
    pixelData: ImageData;
    events = new Events();

    constructor(numBins: number, height: number) {
        const canvas = document.createElement('canvas');
        canvas.classList.add('histogram-canvas');
        canvas.width = numBins;
        canvas.height = height;
        canvas.style.width = `100%`;
        canvas.style.height = `100%`;
        canvas.style.imageRendering = 'pixelated';

        const context = canvas.getContext('2d');
        context.globalCompositeOperation = 'copy';

        context.fillStyle = 'black';
        context.fillRect(0, 0, canvas.width, canvas.height);

        this.canvas = canvas;
        this.context = context;
        this.histogram = new HistogramData(numBins);
        this.pixelData = context.createImageData(canvas.width, canvas.height);

        let dragging = false;
        let dragStart = 0;
        let dragEnd = 0;

        const offsetToBucket = (offset: number) => {
            const rect = this.canvas.getBoundingClientRect();
            const bins = this.histogram.bins.length;
            return Math.max(0, Math.min(bins - 1, Math.floor((offset - rect.left) / rect.width * bins)));
        };

        const bucketToOffset = (bucket: number) => {
            const rect = this.canvas.getBoundingClientRect();
            return bucket / this.histogram.bins.length * rect.width;
        };

        const updateHighlight = () => {
            const rect = this.canvas.getBoundingClientRect();
            const start = Math.min(dragStart, dragEnd);
            const end = Math.max(dragStart, dragEnd);
            this.events.fire('highlight', {
                x: bucketToOffset(start),
                y: 0,
                width: (end - start + 1) / this.histogram.bins.length * rect.width,
                height: rect.height
            });
        };

        this.canvas.addEventListener('pointerdown', (e: PointerEvent) => {
            e.preventDefault();
            e.stopPropagation();

            const h = this.histogram;

            if (h.numValues) {
                this.canvas.setPointerCapture(e.pointerId);
                dragging = true;
                dragStart = dragEnd = offsetToBucket(e.clientX);
                updateHighlight();
            }
        });

        this.canvas.addEventListener('pointerup', (e: PointerEvent) => {
            e.preventDefault();
            e.stopPropagation();

            if (dragging) {
                this.canvas.releasePointerCapture(e.pointerId);

                this.events.fire('select', Math.min(dragStart, dragEnd), Math.max(dragStart, dragEnd));
                dragging = false;
            }
        });

        this.canvas.addEventListener('pointermove', (e: PointerEvent) => {
            e.preventDefault();
            e.stopPropagation();

            const h = this.histogram;

            if (h.numValues) {
                if (dragging) {
                    dragEnd = offsetToBucket(e.clientX);
                    updateHighlight();
                }

                const rect = this.canvas.getBoundingClientRect();
                const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                
                const bin = Math.min(h.bins.length - 1, Math.floor(x * h.bins.length));

                this.events.fire('updateOverlay', {
                    x: e.offsetX,
                    y: e.offsetY,
                    value: h.bucketValue(bin),
                    size: h.bucketSize,
                    count: h.bins[bin],
                    total: h.numValues
                });
            }
        });

        this.canvas.addEventListener('pointerenter', (e: PointerEvent) => {
            this.events.fire('showOverlay');
        });

        this.canvas.addEventListener('pointerleave', (e: PointerEvent) => {
            this.events.fire('hideOverlay');
        });
    }

    // options: {
    //     logScale: boolean
    // }
    update(count: number, value: (v: number) => number | undefined, options: { logScale?: boolean } = {}) {
        this.histogram.calc(count, value);

        // convert bin values to log scale
        const bins = this.histogram.bins;
        const vals = [];
        for (let i = 0; i < bins.length; ++i) {
            vals[i] = options?.logScale ? Math.log(bins[i] + 1) : bins[i];
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
