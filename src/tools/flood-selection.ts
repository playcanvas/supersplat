import { Button, Container, NumericInput } from '@playcanvas/pcui';

import { Events } from '../events';

type Pt = {x: number, y: number};

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
        let point: Pt|undefined;

        // ui
        const selectToolbar = new Container({
            id: 'select-toolbar',
            hidden: true
        });

        selectToolbar.dom.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
        });

        const setButton = new Button({ text: 'Set', class: 'select-toolbar-button' });
        const addButton = new Button({ text: 'Add', class: 'select-toolbar-button' });
        const removeButton = new Button({ text: 'Remove', class: 'select-toolbar-button' });
        const thresholdInput = new NumericInput({
            value: threshold,
            placeholder: 'Threshold',
            width: 120,
            precision: 2,
            min: 0.0,
            max: 1.0
        });

        selectToolbar.append(setButton);
        selectToolbar.append(addButton);
        selectToolbar.append(removeButton);
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

        setButton.dom.addEventListener('pointerdown', (e) => {
            e.stopPropagation(); apply('set');
        });
        addButton.dom.addEventListener('pointerdown', (e) => {
            e.stopPropagation(); apply('add');
        });
        removeButton.dom.addEventListener('pointerdown', (e) => {
            e.stopPropagation(); apply('remove');
        });

        const initCanvas = () => {
            canvas.width = parent.clientWidth;
            canvas.height = parent.clientHeight;

            // clear canvas
            context.clearRect(0, 0, canvas.width, canvas.height);
        };

        const refreshSelection = async () => {
            if (!point) return;

            const width = parent.clientWidth;
            const height = parent.clientHeight;

            const data = await (events.invoke('render.offscreen', width, height) as Promise<Uint8Array>);
            let current: Pt = {
                ...point
            };

            const start = (current.y * width + current.x) * PIXEL;
            let idx = start;
            const pickedOpacity = data[idx + ALPHA];

            const testPixels: Pt[] = [current];
            const imageData = context.createImageData(width, height);
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
            refreshSelection();
        });

        const pointerdown = (e: PointerEvent) => {
            e.preventDefault();
            e.stopPropagation();
        };


        const pointerup = (e: PointerEvent) => {
            e.preventDefault();
            e.stopPropagation();

            const { offsetX, offsetY } = e;
            point = {
                x: Math.floor(offsetX),
                y: Math.floor(offsetY)
            };

            refreshSelection();
        };

        const wheel = (e: WheelEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const { deltaX, deltaY } = e;
            const value = (Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY) > 0 ? 0.05 : -0.05;

            thresholdInput.value = threshold + value;

            e.preventDefault();
            e.stopPropagation();
        };

        this.activate = () => {
            parent.style.display = 'block';
            canvas.style.display = 'inline';
            selectToolbar.hidden = false;
            parent.addEventListener('pointerdown', pointerdown);
            parent.addEventListener('pointerup', pointerup);
            parent.addEventListener('wheel', wheel);
            initCanvas();
        };

        this.deactivate = () => {
            parent.style.display = 'none';
            canvas.style.display = 'none';
            selectToolbar.hidden = true;
            parent.removeEventListener('pointerdown', pointerdown);
            parent.removeEventListener('pointerup', pointerup);
            parent.removeEventListener('wheel', wheel);
            point = undefined;
        };
    }
}

export { FloodSelection };
