import { Events } from "../events";

class PickerSelection {
    events: Events;
    root: HTMLElement;

    constructor(events: Events, parent: HTMLElement) {
        this.root = document.createElement('div');
        this.root.id = 'select-root';
        this.root.style.touchAction = 'none';

        this.root.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse' ? e.button === 0 : e.isPrimary) {
                e.preventDefault();
                e.stopPropagation();

                events.fire(
                    'select.point',
                    e.shiftKey ? 'add' : (e.ctrlKey ? 'remove' : 'set'),
                    { x: e.offsetX / this.root.clientWidth, y: e.offsetY / this.root.clientHeight }
                );
            }
        });

        parent.appendChild(this.root);

        this.root.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }

    activate() {
        this.root.style.display = 'block';
    }

    deactivate() {
        this.root.style.display = 'none';
    }
}

export { PickerSelection };

