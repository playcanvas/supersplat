import { Container, NumericInput } from '@playcanvas/pcui';

import type { Events } from '../events';
import { opFromModifiers } from '../select-op';

type NormalizedPoint = { x: number; y: number };

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

class EyedropperSelection {
    activate: () => void;
    deactivate: () => void;

    constructor(events: Events, parent: HTMLElement, canvasContainer: Container) {
        let pointerId: number | null = null;
        // the colour match of a finished press is still settling, and a new
        // press waits for it
        let finishing = false;
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
            if (
                pointerId === null &&
                !finishing &&
                (event.pointerType === 'mouse' ? event.button === 0 : event.isPrimary)
            ) {
                event.preventDefault();
                event.stopPropagation();
                pointerId = event.pointerId;
                parent.setPointerCapture(pointerId);
            }
        };

        const pointermove = (event: PointerEvent) => {
            if (event.pointerId === pointerId) {
                // a mouse moving with no button held missed its release: this
                // move ends the press (see brush-selection)
                if (event.pointerType === 'mouse' && event.buttons === 0) {
                    pointerup(event);
                    return;
                }
                event.preventDefault();
                event.stopPropagation();
            }
        };

        const pointerup = async (event: PointerEvent) => {
            if (event.pointerId === pointerId) {
                event.preventDefault();
                event.stopPropagation();

                // the press ends here, not once its match settles: a buttonless
                // move in between would end it again (see pointermove) and
                // sample a second colour
                resetPointer();
                finishing = true;

                try {
                    await events.invoke(
                        'select.colorMatch',
                        opFromModifiers(event),
                        toNormalizedPoint(event),
                        threshold
                    );
                } finally {
                    finishing = false;
                }
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
