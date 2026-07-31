import { Container, Label } from '@playcanvas/pcui';

import { Events } from '../events';

// text refresh interval. The graph redraws every frame, but the numbers are
// unreadable if they change 60 times a second.
const TEXT_REFRESH_MS = 250;

const GRAPH_WIDTH = 180;
const GRAPH_HEIGHT = 30;

// frames the numbers are averaged over: one second at 60Hz. The graph plots the
// whole history the scene keeps, which is longer - a percentile cannot react to
// a change of render mode until half its window has shifted through, so the two
// spans are deliberately different.
const STATS_FRAMES = 60;

// fixed graph scales in ms, so the plot means the same thing from one session
// to the next. 16.7 and 33.3 are the 60Hz and 30Hz budgets.
const SCALES = [1, 2, 4, 8, 16.7, 33.3, 66.7, 133.3, 266.7];

const GRAPH_BG = 'rgba(0, 0, 0, 0.35)';
const GRAPH_BAR = '#f60';
const GRAPH_MEDIAN = 'rgba(255, 255, 255, 0.5)';

const fmt = (ms: number) => (ms >= 10 ? ms.toFixed(1) : ms.toFixed(2));
const fmtScale = (ms: number) => (Number.isInteger(ms) ? `${ms}` : ms.toFixed(1));

// min / median / p95 over the sample window. Which one to trust depends on what
// you are asking:
//
// - min is the cleanest estimate of the GPU's own cost. The frame span includes
//   any idle bubble between passes, and bubbles only ever add time, so the
//   fastest frame in the window is the one least polluted by them.
// - p95 is the number that matters for how the editor feels, and it is what
//   catches the heavy-overdraw cases: it includes the frames that stalled.
// - the gap between them is itself the signal. min == p95 means the frame cost
//   is genuinely stable; a wide gap means something intermittent (a pick
//   readback, a data-processor dispatch, a shader compile) is landing inside
//   the measured span.
const summarise = (values: number[]) => {
    const sorted = values.filter(v => v > 0).sort((a, b) => a - b);
    if (sorted.length === 0) {
        return null;
    }
    return {
        min: sorted[0],
        median: sorted[sorted.length >> 1],
        p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
        max: sorted[sorted.length - 1]
    };
};

class PerfOverlay extends Container {
    constructor(events: Events) {
        super({
            id: 'perf-overlay',
            hidden: true
        });

        const createRow = (key: string) => {
            const row = new Container({ class: 'perf-row' });
            const keyLabel = new Label({ class: 'perf-key', text: key });
            const valueLabel = new Label({ class: 'perf-value' });
            row.append(keyLabel);
            row.append(valueLabel);
            this.append(row);
            return valueLabel;
        };

        const gpuValue = createRow('GPU');
        const cpuValue = createRow('CPU');

        const canvas = document.createElement('canvas');
        canvas.className = 'perf-graph';
        canvas.width = GRAPH_WIDTH;
        canvas.height = GRAPH_HEIGHT;
        canvas.style.width = `${GRAPH_WIDTH}px`;
        canvas.style.height = `${GRAPH_HEIGHT}px`;
        this.dom.appendChild(canvas);
        const ctx = canvas.getContext('2d');

        const note = new Label({ class: 'perf-note' });
        this.append(note);

        let lastText = 0;

        const draw = (values: number[], median: number, scale: number) => {
            ctx.fillStyle = GRAPH_BG;
            ctx.fillRect(0, 0, GRAPH_WIDTH, GRAPH_HEIGHT);

            // the whole window stretched to fill the width, oldest on the left.
            // The sample count varies with the refresh rate, so columns are
            // placed by proportion rather than given a fixed width.
            ctx.fillStyle = GRAPH_BAR;
            const n = values.length;
            for (let i = 0; i < n; ++i) {
                const x0 = Math.round(i * GRAPH_WIDTH / n);
                const x1 = Math.round((i + 1) * GRAPH_WIDTH / n);
                const h = Math.min(GRAPH_HEIGHT, Math.round(values[i] / scale * GRAPH_HEIGHT));
                ctx.fillRect(x0, GRAPH_HEIGHT - h, Math.max(1, x1 - x0), h);
            }

            ctx.fillStyle = GRAPH_MEDIAN;
            const y = GRAPH_HEIGHT - Math.round(median / scale * GRAPH_HEIGHT);
            ctx.fillRect(0, y, GRAPH_WIDTH, 1);
        };

        events.on('view.perfOverlay', (visible: boolean) => {
            this.hidden = !visible;
        });

        events.on('postrender', () => {
            if (this.hidden) {
                return;
            }

            const timings = events.invoke('scene.frameTimings');
            const gpu = summarise(timings.gpu.slice(-STATS_FRAMES));
            const cpu = summarise(timings.cpu.slice(-STATS_FRAMES));

            if (gpu) {
                // the scale has to cover everything plotted, not just the frames
                // the numbers average over, or older spikes would be flat-topped
                const plotMax = timings.gpu.reduce((a: number, b: number) => Math.max(a, b), 0);
                const scale = SCALES.find(s => plotMax <= s) ?? plotMax;
                draw(timings.gpu, gpu.median, scale);

                const now = performance.now();
                if (now - lastText >= TEXT_REFRESH_MS) {
                    lastText = now;
                    gpuValue.text = `${fmt(gpu.median)} ms  min ${fmt(gpu.min)}  p95 ${fmt(gpu.p95)}`;
                    cpuValue.text = cpu ? `${fmt(cpu.median)} ms  p95 ${fmt(cpu.p95)}` : '-';
                    note.text = `${timings.width}x${timings.height}  ${timings.stochastic ? 'stochastic' : 'sorted'}  0-${fmtScale(scale)}ms`;
                }
            } else {
                // the timestamp readback is async, so the first frames after a
                // load have no report yet - that is not the same as a device
                // without timestamp-query support
                gpuValue.text = timings.gpuSupported ? '-' : 'unsupported';
                cpuValue.text = cpu ? `${fmt(cpu.median)} ms` : '-';
            }
        });
    }
}

export { PerfOverlay };
