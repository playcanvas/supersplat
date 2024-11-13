import { Events } from '../events';

class HistogramData {
    bins: { selected: number, unselected: number }[];
    numValues: number;
    minValue: number;
    maxValue: number;

    constructor(numBins: number) {
        this.bins = [];
        for (let i = 0; i < numBins; ++i) {
            this.bins.push({ selected: 0, unselected: 0 });
        }
    }

    calc(count: number, valueFunc: (v: number) => number | undefined, selectedFunc: (v: number) => boolean) {
        // clear bins
        const bins = this.bins;
        for (let i = 0; i < bins.length; ++i) {
            bins[i].selected = bins[i].unselected = 0;
        }

        // calculate min, max
        let min, max, i;
        for (i = 0; i < count; i++) {
            const v = valueFunc(i);
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
            const v = valueFunc(i);
            if (v !== undefined) {
                if (v < min) min = v; else if (v > max) max = v;
            }
        }

        // fill bins
        for (let i = 0; i < count; i++) {
            const v = valueFunc(i);
            if (v !== undefined) {
                const n = min === max ? 0 : (v - min) / (max - min);
                const bin = Math.min(bins.length - 1, Math.floor(n * bins.length));
                if (selectedFunc(i)) {
                    bins[bin].selected++;
                } else {
                    bins[bin].unselected++;
                }
            }
        }
        this.numValues = bins.reduce((t, v) => t + v.selected + v.unselected, 0);
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

interface UpdateOptions {
    count: number;
    valueFunc: (v: number) => number | undefined;
    selectedFunc: (v: number) => boolean;
    logScale?: boolean
}

class Histogram {
    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D;
    histogram: HistogramData;
    pixelData: ImageData;
    events = new Events();

    constructor(numBins: number, height: number) {
        const canvas = document.createElement('canvas');
        canvas.setAttribute('id', 'histogram-canvas');
        canvas.width = numBins;
        canvas.height = height;
        canvas.style.width = '100%';
        canvas.style.height = '100%';

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

                const op = e.shiftKey ? 'add' : (e.ctrlKey ? 'remove' : 'set');
                this.events.fire('select', op, Math.min(dragStart, dragEnd), Math.max(dragStart, dragEnd));
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

                const binIndex = Math.min(h.bins.length - 1, Math.floor(x * h.bins.length));
                const bin = h.bins[binIndex];

                this.events.fire('updateOverlay', {
                    x: e.offsetX,
                    y: e.offsetY,
                    value: h.bucketValue(binIndex),
                    size: h.bucketSize,
                    selected: bin.selected,
                    unselected: bin.unselected,
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

    update(options: UpdateOptions) {
        // update histogram data
        this.histogram.calc(options.count, options.valueFunc, options.selectedFunc);

        // draw histogram
        const canvas = this.canvas;
        const context = this.context;
        const pixelData = this.pixelData;
        const pixels = new Uint32Array(pixelData.data.buffer);

        const binMap = options.logScale ? (x: number) => Math.log(x + 1) : (x: number) => x;
        const bins = this.histogram.bins.map((v) => {
            return {
                selected: binMap(v.unselected + v.selected),
                unselected: binMap(v.unselected)
            };
        });
        const binMax = bins.reduce((a, v) => Math.max(a, v.selected), 0);

        let i = 0;
        for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < bins.length; x++) {
                const bin = bins[x];
                const targetMin = binMax / canvas.height * (canvas.height - 1 - y);

                if (targetMin >= bin.selected) {
                    pixels[i++] = 0xff000000;
                } else {
                    const targetMax = targetMin + binMax / canvas.height;
                    if (bin.selected === bin.unselected || targetMax < bin.unselected) {
                        pixels[i++] = 0xffff7777;
                    } else {
                        pixels[i++] = 0xff00ffff;
                    }
                }
            }
        }

        context.putImageData(pixelData, 0, 0);
    }
}

export { Histogram };
