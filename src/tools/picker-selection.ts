import { Events } from "../events";

class PickerSelection {
    activate: () => void;
    deactivate: () => void;

    constructor(events: Events, parent: HTMLElement, canvas: HTMLCanvasElement) {
        const pointerdown = (e: PointerEvent) => {
            if (e.pointerType === 'mouse' ? e.button === 0 : e.isPrimary) {
                e.preventDefault();
                e.stopPropagation();

                events.fire(
                    'select.point',
                    e.shiftKey ? 'add' : (e.ctrlKey ? 'remove' : 'set'),
                    { x: e.offsetX / canvas.clientWidth, y: e.offsetY / canvas.clientHeight }
                );
            }
        };

        this.activate = () => {
            canvas.addEventListener('pointerdown', pointerdown, true);
        }
    
        this.deactivate = () => {
            canvas.removeEventListener('pointerdown', pointerdown, true);
        }
    }
}

export { PickerSelection };

