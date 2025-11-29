import { Container, NumericInput } from '@playcanvas/pcui';

import { Events } from '../events';

type PointerOp = 'set' | 'add' | 'remove';

type NormalizedPoint = { x: number, y: number };

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

class EyedropperSelection {
    activate: () => void;
    deactivate: () => void;

    constructor(events: Events, parent: HTMLElement, canvasContainer: Container) {
        let pointerId: number | null = null;
        let threshold = 0.2;

        const selectToolbar = new Container({
            class: 'select-toolbar',
            hidden: true
        });

        selectToolbar.dom.addEventListener('pointerdown', (event) => {
            event.stopPropagation();
        });

        const thresholdInput = new NumericInput({
            value: threshold,
            placeholder: 'Threshold',
            width: 120,
            precision: 3,
            min: 0,
            max: 1
        });

        selectToolbar.append(thresholdInput);
        canvasContainer.append(selectToolbar);

        const getPointerOp = (event: PointerEvent): PointerOp => {
            if (event.shiftKey) {
                return 'add';
            }
            if (event.ctrlKey) {
                return 'remove';
            }
            return 'set';
        };
        // Convert pointer event to normalized coordinates within the parent element
        const toNormalizedPoint = (event: PointerEvent): NormalizedPoint => {
            const width = parent.clientWidth || 1;
            const height = parent.clientHeight || 1;
            return {
                x: clamp01(event.offsetX / width),
                y: clamp01(event.offsetY / height)
            };
        };

        const resetPointer = () => {
            if (pointerId !== null) {
                parent.releasePointerCapture(pointerId);
                pointerId = null;
            }
        };

        thresholdInput.on('change', () => {
            threshold = clamp01(thresholdInput.value ?? threshold);
        });

        const pointerdown = (event: PointerEvent) => {
            if (pointerId === null && (event.pointerType === 'mouse' ? event.button === 0 : event.isPrimary)) {
                event.preventDefault();
                event.stopPropagation();
                pointerId = event.pointerId;
                parent.setPointerCapture(pointerId);
            }
        };

        const pointermove = (event: PointerEvent) => {
            if (event.pointerId === pointerId) {
                event.preventDefault();
                event.stopPropagation();
            }
        };

        const pointerup = (event: PointerEvent) => {
            if (event.pointerId === pointerId) {
                event.preventDefault();
                event.stopPropagation();
                resetPointer();

                events.fire('select.colorMatch', getPointerOp(event), toNormalizedPoint(event), threshold);
            }
        };

        const pointercancel = (event: PointerEvent) => {
            if (event.pointerId === pointerId) {
                event.preventDefault();
                event.stopPropagation();
                resetPointer();
            }
        };

        this.activate = () => {
            parent.style.display = 'block';
            selectToolbar.hidden = false;
            parent.addEventListener('pointerdown', pointerdown);
            parent.addEventListener('pointermove', pointermove);
            parent.addEventListener('pointerup', pointerup);
            parent.addEventListener('pointercancel', pointercancel);
        };

        this.deactivate = () => {
            parent.style.display = 'none';
            selectToolbar.hidden = true;
            resetPointer();
            parent.removeEventListener('pointerdown', pointerdown);
            parent.removeEventListener('pointermove', pointermove);
            parent.removeEventListener('pointerup', pointerup);
            parent.removeEventListener('pointercancel', pointercancel);
        };
    }
}

export { EyedropperSelection };
