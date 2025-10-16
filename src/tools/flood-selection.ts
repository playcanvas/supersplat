import { Container, NumericInput } from '@playcanvas/pcui';

import { Events } from '../events';

type Pt = {x : number, y: number };

const RED = 0;
const GREEN = 1;
const BLUE = 2;
const ALPHA = 3;
const PIXEL = 4;

class FloodSelection {
    activate: () => void;
    deactivate: () => void;

    constructor(events: Events, parent: HTMLElement, mask: { canvas: HTMLCanvasElement, context: CanvasRenderingContext2D }, canvasContainer: Container) {

        // create canvas
        const { canvas, context } = mask;

        let threshold = 0.2;
        let point: Pt;
        let imageData: ImageData;

        // ui
        const selectToolbar = new Container({
            id: 'select-toolbar',
            hidden: true
        });

        selectToolbar.dom.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
        });

        const thresholdInput = new NumericInput({
            value: threshold,
            placeholder: 'Threshold',
            width: 120,
            precision: 3,
            min: 0.001,
            max: 0.999
        });
        selectToolbar.append(thresholdInput);

        canvasContainer.append(selectToolbar);

        const apply = (op: 'set' | 'add' | 'remove') => {
            events.fire(
                'select.byMask',
                op,
                canvas,
                context
            );
        };

        const refreshSelection = async () => {
            if (!point) return;

            const width = parent.clientWidth;
            const height = parent.clientHeight;

            if (!imageData || canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
                imageData = context.createImageData(width, height);
            }

            const data = await (events.invoke('render.offscreen', width, height) as Promise<Uint8Array>);
            let current: Pt = {
                ...point
            };

            const start = (current.y * width + current.x) * PIXEL;
            let idx = start;
            const pickedOpacity = data[idx + ALPHA];

            const testPixels: Pt[] = [current];
            const d = imageData.data;

            d.fill(102);

            while (testPixels.length > 0) {
                current = testPixels.pop();
                idx = (current.y * width + current.x) * PIXEL;
                if (Math.abs(data[idx + 3] - pickedOpacity) < threshold * 255) {
                    d[idx + RED] = 255;
                    d[idx + BLUE] = 0;
                    d[idx + ALPHA] = 255;

                    if (current.x > 0 && d[idx - PIXEL + ALPHA] === 102) testPixels.push({ x: current.x - 1, y: current.y });
                    if (current.x < width - 1 && d[idx + PIXEL + ALPHA] === 102) testPixels.push({ x: current.x + 1, y: current.y });
                    if (current.y > 0 && d[idx - width * PIXEL + ALPHA] === 102) testPixels.push({ x: current.x, y: current.y - 1 });
                    if (current.y < height - 1 && d[idx + width * PIXEL + ALPHA] === 102) testPixels.push({ x: current.x, y: current.y + 1 });
                } else {
                    d[idx + ALPHA] = 0;
                }
            }

            context.putImageData(imageData, 0, 0);
        };

        thresholdInput.on('change', () => {
            threshold = thresholdInput.value;
        });

        const isPrimary = (e: PointerEvent) => {
            return e.pointerType === 'mouse' ? e.button === 0 : e.isPrimary;
        };

        let clicked = false;

        const pointerdown = (e: PointerEvent) => {
            if (!clicked && isPrimary(e)) {
                clicked = true;
            }
        };

        const pointermove = (e: PointerEvent) => {
            clicked = false;
        };

        const pointerup = async (e: PointerEvent) => {
            if (clicked && isPrimary(e)) {
                clicked = false;

                point = {
                    x: Math.floor(e.offsetX),
                    y: Math.floor(e.offsetY)
                };

                await refreshSelection();

                apply(e.shiftKey ? 'add' : (e.ctrlKey ? 'remove' : 'set'));

                context.clearRect(0, 0, canvas.width, canvas.height);
            }
        };

        this.activate = () => {
            parent.style.display = 'block';
            selectToolbar.hidden = false;
            canvasContainer.dom.addEventListener('pointerdown', pointerdown);
            canvasContainer.dom.addEventListener('pointermove', pointermove);
            canvasContainer.dom.addEventListener('pointerup', pointerup, true);
        };

        this.deactivate = () => {
            parent.style.display = 'none';
            selectToolbar.hidden = true;
            canvasContainer.dom.removeEventListener('pointerdown', pointerdown);
            canvasContainer.dom.removeEventListener('pointermove', pointermove);
            canvasContainer.dom.removeEventListener('pointerup', pointerup);
            point = undefined;
        };
    }
}

export { FloodSelection };
