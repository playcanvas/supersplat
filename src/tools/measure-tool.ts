import { Container } from 'pcui';
import { Color, Vec3 } from 'playcanvas';

import { Events } from '../events';
import { Scene } from '../scene';

class MeasureTool {
    activate: () => void;
    deactivate: () => void;

    constructor(events: Events, parent: HTMLElement, scene: Scene, canvasContainer: Container) {
        const current = new Vec3();
        let pointA: Vec3 = null;
        let pointB: Vec3 = null;

        const pointerdown = (e: PointerEvent) => {
            if (pointA) {
                pointA.copy(current);
                pointB = null;
            } else {
                pointA = current.clone();
            }
            e.preventDefault();
            e.stopPropagation();
        };

        const pointermove = (e: PointerEvent) => {
            const result = scene.camera.intersect(e.clientX, e.clientY);
            if (result.length > 0) {
                const closest = result.reduce((a, b) => {
                    return a.distance < b.distance ? a : b;
                });
                current.copy(closest.position);
            }
            scene.forceRender = true;
            e.preventDefault();
            e.stopPropagation();
        };

        const pointerup = (e: PointerEvent) => {
            pointB = current.clone();
            scene.forceRender = true;
            e.preventDefault();
            e.stopPropagation();
        };

        scene.events.on('prerender', () => {
            if (pointA) {
                scene.app.drawLine(pointA, pointB ?? current, Color.RED, true, scene.debugLayer);
            }
        });

        this.activate = () => {
            parent.style.display = 'block';
            parent.addEventListener('pointerdown', pointerdown);
            parent.addEventListener('pointermove', pointermove);
            parent.addEventListener('pointerup', pointerup);
        };

        this.deactivate = () => {
            pointA = pointB = null;
            parent.style.display = 'none';
            parent.removeEventListener('pointerdown', pointerdown);
            parent.removeEventListener('pointermove', pointermove);
            parent.removeEventListener('pointerup', pointerup);
        };
    }
}

export { MeasureTool };
