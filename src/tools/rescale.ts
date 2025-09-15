import { Events } from '../events';
import { Scene } from '../scene';

import { SphereShape } from '../sphere-shape';

class RescaleTool {
    activate: () => void;
    deactivate: () => void;

    constructor(events: Events, scene: Scene, parent: HTMLElement) {
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
                }
            }
        };

        this.activate = () => {
            parent.style.display = 'block';
            parent.addEventListener('pointerdown', pointerdown);
        };

        this.deactivate = () => {
            parent.style.display = 'none';
            parent.removeEventListener('pointerdown', pointerdown);
        };
    }
}

export { RescaleTool };
