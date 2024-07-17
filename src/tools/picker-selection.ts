import { Events } from "../events";

class PickerSelection {
    activate: () => void;
    deactivate: () => void;

    constructor(events: Events, parent: HTMLElement) {
        const pointerdown = (e: PointerEvent) => {
            if (e.pointerType === 'mouse' ? e.button === 0 : e.isPrimary) {
                e.preventDefault();
                e.stopPropagation();

                events.fire(
                    'select.point',
                    e.shiftKey ? 'add' : (e.ctrlKey ? 'remove' : 'set'),
                    { x: e.offsetX / parent.clientWidth, y: e.offsetY / parent.clientHeight }
                );
            }
        };

        this.activate = () => {
            parent.style.display = 'block';
            parent.addEventListener('pointerdown', pointerdown);
        }

        this.deactivate = () => {
            parent.style.display = 'none';
            parent.removeEventListener('pointerdown', pointerdown);
        }
    }
}

export { PickerSelection };

