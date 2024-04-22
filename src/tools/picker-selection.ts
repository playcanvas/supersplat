import { Events } from "../events";

class PickerSelection {
    events: Events;
    root: HTMLElement;

    constructor(events: Events, parent: HTMLElement) {
        this.root = document.createElement('div');
        this.root.id = 'select-root';

        this.root.onmousedown = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();

            if (e.button === 0) {
                events.fire(
                    'select.point',
                    e.shiftKey ? 'add' : (e.ctrlKey ? 'remove' : 'set'),
                    { x: e.offsetX / this.root.clientWidth, y: e.offsetY / this.root.clientHeight }
                );
            }
        };

        parent.appendChild(this.root);
    }

    activate() {
        this.root.style.display = 'block';
    }

    deactivate() {
        this.root.style.display = 'none';
    }
};

export { PickerSelection };

