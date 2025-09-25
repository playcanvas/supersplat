import { Button, Container, NumericInput } from '@playcanvas/pcui';
import { Events } from '../events';
import { Scene } from '../scene';

import { SphereShape } from '../sphere-shape';

class MeasureTool {
    activate: () => void;
    deactivate: () => void;

    constructor(events: Events, scene: Scene, parent: HTMLElement, canvasContainer: Container) {
        // ui
        const lengthInput = new NumericInput({
            precision: 2,
            value: 0,
            placeholder: 'Length',
            width: 80,
            min: 0.01
        });

        const apply = new Button({
            text: 'Apply',
            class: 'select-toolbar-button'
        });

        const selectToolbar = new Container({
            id: 'select-toolbar',
            hidden: true
        });

        selectToolbar.dom.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
        });

        selectToolbar.append(lengthInput);
        selectToolbar.append(apply);
        canvasContainer.append(selectToolbar);

        lengthInput.on('change', () => {

        });

        apply.on('click', () => {
            
        });

        const pointerdown = (e: PointerEvent) => {
            if (e.pointerType === 'mouse' ? e.button === 0 : e.isPrimary) {
                e.preventDefault();
                e.stopPropagation();

                const result = scene.camera.intersect(e.offsetX, e.offsetY);
                if (result) {
                    const sphere = new SphereShape();
                    scene.add(sphere);
                    sphere.pivot.setPosition(result.position);
                    sphere.radius = 0.1;
                    sphere.stripSize = 1.0;
                }
            }
        };

        let active = false;

        this.activate = () => {
            active = true;
            parent.addEventListener('pointerdown', pointerdown);
            parent.style.display = 'block';
            selectToolbar.hidden = false;
        };

        this.deactivate = () => {
            selectToolbar.hidden = true;
            parent.style.display = 'none';
            parent.removeEventListener('pointerdown', pointerdown);
            active = false;
        };
    }
}

export { MeasureTool };
