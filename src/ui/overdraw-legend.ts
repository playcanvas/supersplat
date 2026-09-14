import { Container } from '@playcanvas/pcui';

import { Events } from '../events';

// the blit shader's ramp (overdrawColor in blit-shader.ts): stop k is the colour
// of 2^k - 1 fragments per pixel, so the two tables have to stay in step
const STOPS = [
    [0, 0, 0],
    [0, 0, 0.4],
    [0, 0, 1],
    [0, 0.5, 1],
    [0, 1, 1],
    [0, 1, 0],
    [0.5, 1, 0],
    [1, 1, 0],
    [1, 0.5, 0],
    [1, 0, 0],
    [1, 0, 1],
    [1, 1, 1]
];

// fragment counts labelled under the bar
const TICKS = [1, 4, 16, 64, 256, 1024];

const WIDTH = 220;
const BAR_HEIGHT = 10;
const HEIGHT = 26;

// colour scale for the overdraw view: the ramp as a bar with the fragment
// count it stands for marked along it
class OverdrawLegend extends Container {
    constructor(events: Events) {
        super({
            id: 'overdraw-legend',
            hidden: true
        });

        const canvas = document.createElement('canvas');
        canvas.width = WIDTH;
        canvas.height = HEIGHT;
        canvas.style.width = `${WIDTH}px`;
        canvas.style.height = `${HEIGHT}px`;
        this.dom.appendChild(canvas);

        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, WIDTH, 0);
        STOPS.forEach(([r, g, b], i) => {
            gradient.addColorStop(i / (STOPS.length - 1), `rgb(${r * 255}, ${g * 255}, ${b * 255})`);
        });
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, WIDTH, BAR_HEIGHT);

        // the labels sit over the heat map itself, which runs to white
        ctx.fillStyle = 'white';
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 4;
        ctx.font = '11px ui-monospace, Menlo, Consolas, monospace';
        ctx.textBaseline = 'top';
        TICKS.forEach((count) => {
            const x = Math.min(1, Math.log2(1 + count) / (STOPS.length - 1)) * WIDTH;
            ctx.textAlign = x >= WIDTH ? 'right' : 'center';
            ctx.fillText(`${count}`, x, BAR_HEIGHT + 3);
        });

        events.on('view.overdraw', (value: boolean) => {
            this.hidden = !value;
        });
    }
}

export { OverdrawLegend };
