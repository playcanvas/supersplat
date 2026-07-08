import { Events } from '../events';
import { opFromModifiers } from '../select-op';
import { applyOpCursor } from './select-cursor';

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
        this.numValues = 0;
        this.minValue = 0;
        this.maxValue = 0;
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

interface SetDataOptions {
    selected: Float32Array;     // length = numBins
    unselected: Float32Array;   // length = numBins
    min: number;
    max: number;
    numValues: number;
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
        let activePointerId = -1;
        let hovering = false;

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
            const h = this.histogram;
            const bins = h.bins.length;
            const start = Math.min(dragStart, dragEnd);
            const end = Math.max(dragStart, dragEnd);
            // anchorEdge / cursorEdge are bucket-boundary indices in [0, bins].
            // they identify the OUTER edges of the highlight rect: anchorEdge
            // is the side closest to the click, cursorEdge is the side closest
            // to the live pointer. when dragging right (or zero-width), anchor
            // is the left edge of dragStart and cursor is the right edge of
            // dragEnd; reversed when dragging left.
            const draggingRight = dragEnd >= dragStart;
            const anchorEdge = draggingRight ? dragStart : dragStart + 1;
            const cursorEdge = draggingRight ? dragEnd + 1 : dragEnd;
            const edgeX = (i: number) => i / bins * rect.width;
            const edgeValue = (i: number) => h.minValue + i * h.bucketSize;
            this.events.fire('highlight', {
                x: bucketToOffset(start),
                y: 0,
                width: (end - start + 1) / bins * rect.width,
                height: rect.height,
                startBucket: start,
                endBucket: end,
                anchorBucket: dragStart,
                cursorBucket: dragEnd,
                anchorX: edgeX(anchorEdge),
                cursorX: edgeX(cursorEdge),
                anchorValue: edgeValue(anchorEdge),
                cursorValue: edgeValue(cursorEdge)
            });
        };

        // unify drag-end behavior so pointerup commits and pointercancel /
        // lostpointercapture abort without leaving `dragging` stuck true. all
        // three event paths funnel here, so the SVG highlight rect cannot be
        // orphaned by a missed pointerup (e.g. release off-canvas, alt-tab,
        // OS modal interrupt).
        const endDrag = (commit: boolean, shiftKey = false, ctrlKey = false) => {
            if (!dragging) return;
            dragging = false;
            if (activePointerId !== -1) {
                try {
                    this.canvas.releasePointerCapture(activePointerId);
                } catch {
                    // capture may already be lost (the very thing we're
                    // recovering from); swallow.
                }
                activePointerId = -1;
            }
            if (commit) {
                const op = opFromModifiers({ shiftKey, ctrlKey });
                this.events.fire('select', op, Math.min(dragStart, dragEnd), Math.max(dragStart, dragEnd));
            } else {
                this.events.fire('cancelHighlight');
            }
        };

        this.canvas.addEventListener('pointerdown', (e: PointerEvent) => {
            e.preventDefault();
            e.stopPropagation();

            const h = this.histogram;

            if (h.numValues) {
                this.canvas.setPointerCapture(e.pointerId);
                activePointerId = e.pointerId;
                dragging = true;
                dragStart = dragEnd = offsetToBucket(e.clientX);
                updateHighlight();
            }
        });

        this.canvas.addEventListener('pointerup', (e: PointerEvent) => {
            e.preventDefault();
            e.stopPropagation();
            endDrag(true, e.shiftKey, e.ctrlKey);
        });

        // pointercancel signals user intent to abort (OS modal, alt-tab,
        // multi-touch, etc.). pointer is gone, nothing to commit.
        this.canvas.addEventListener('pointercancel', () => endDrag(false));

        // lostpointercapture is informational, not a user-intent signal. in the
        // normal pointerup flow it fires AFTER our pointerup handler has run, by
        // which time `dragging` is false and endDrag short-circuits. when it
        // fires mid-drag without a prior pointerup (Chrome occasionally reorders
        // these around DOM mutation / extension-injected events), the prior
        // behaviour was to silently abort — which produces the "click sometimes
        // doesn't register" symptom. commit instead, using the modifier state
        // on the event so add/remove/set are preserved.
        this.canvas.addEventListener('lostpointercapture', (e: PointerEvent) => {
            endDrag(true, e.shiftKey, e.ctrlKey);
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

                // continuous (non-bucketed) value at the cursor's pixel x.
                // x is already clamped to [0, 1] above.
                const cursorValue = h.minValue + x * (h.maxValue - h.minValue);

                this.events.fire('updateOverlay', {
                    x: e.offsetX,
                    y: e.offsetY,
                    bucketIndex: binIndex,
                    value: h.bucketValue(binIndex),
                    size: h.bucketSize,
                    cursorValue,
                    selected: bin.selected,
                    unselected: bin.unselected,
                    total: h.numValues
                });
            }
        });

        // keep the cursor showing the op the modifiers will apply (add/remove/
        // intersect) while hovering the interactive histogram, matching the
        // selection tools. numValues gates it so an empty histogram is unaffected.
        const syncCursor = (e: { shiftKey: boolean, ctrlKey: boolean }) => {
            if (hovering) {
                applyOpCursor(this.canvas, this.histogram.numValues ? opFromModifiers(e) : 'set');
            }
        };

        this.canvas.addEventListener('pointerenter', (e: PointerEvent) => {
            hovering = true;
            this.events.fire('showOverlay');
            syncCursor(e);
        });

        this.canvas.addEventListener('pointerleave', () => {
            hovering = false;
            this.events.fire('hideOverlay');
            applyOpCursor(this.canvas, 'set');
        });

        // capture phase so a modifier press updates the cursor even while another
        // element holds focus; blur clears because a key release while unfocused
        // never fires. (mirrors the selection-tool cursor and controllers.ts)
        window.addEventListener('keydown', e => syncCursor(e), { capture: true });
        window.addEventListener('keyup', e => syncCursor(e), { capture: true });
        window.addEventListener('blur', () => applyOpCursor(this.canvas, 'set'));
    }

    private render(logScale: boolean) {
        const canvas = this.canvas;
        const context = this.context;
        const pixelData = this.pixelData;
        const pixels = new Uint32Array(pixelData.data.buffer);

        const binMap = logScale ? (x: number) => Math.log(x + 1) : (x: number) => x;
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

    setData(options: SetDataOptions) {
        const bins = this.histogram.bins;
        const n = Math.min(bins.length, options.selected.length);
        for (let i = 0; i < n; i++) {
            bins[i].selected = options.selected[i];
            bins[i].unselected = options.unselected[i];
        }
        this.histogram.numValues = options.numValues;
        this.histogram.minValue = options.min;
        this.histogram.maxValue = options.max;
        this.render(options.logScale);
    }
}

export { Histogram };
