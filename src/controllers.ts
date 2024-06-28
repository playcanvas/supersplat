import { Camera } from './camera';
import { Vec3 } from 'playcanvas';

const fromWorldPoint = new Vec3();
const toWorldPoint = new Vec3();
const worldDiff = new Vec3();

// calculate the distance between two 2d points
const dist = (x0: number, y0: number, x1: number, y1: number) => Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2);

class PointerController {
    destroy: () => void;

    constructor(camera: Camera, target: HTMLElement) {

        const orbit = (dx: number, dy: number) => {
            const azim = camera.azim - dx * camera.scene.config.controls.orbitSensitivity;
            const elev = camera.elevation - dy * camera.scene.config.controls.orbitSensitivity;
            camera.setAzimElev(azim, elev);
        }

        const pan = (x: number, y: number, dx: number, dy: number) => {
            // For panning to work at any zoom level, we use screen point to world projection
            // to work out how far we need to pan the pivotEntity in world space
            const c = camera.entity.camera;
            const distance = camera.focusDistance * camera.distanceTween.value.distance;

            c.screenToWorld(x, y, distance, fromWorldPoint);
            c.screenToWorld(x - dx, y - dy, distance, toWorldPoint);

            worldDiff.sub2(toWorldPoint, fromWorldPoint);
            worldDiff.add(camera.focalPoint);
    
            camera.setFocalPoint(worldDiff);
        };

        const zoom = (amount: number) => {
            camera.setDistance(camera.distance * (1 - amount * camera.scene.config.controls.zoomSensitivity), 2);
        };

        // mouse state
        const buttons = [false, false, false];
        let x: number, y: number;

        // touch state
        let touches: { id: number, x: number, y: number}[] = [];
        let midx: number, midy: number, midlen: number;

        const pointerdown = (event: PointerEvent) => {
            if (event.pointerType === 'mouse') {
                if (buttons.every(b => !b)) {
                    target.setPointerCapture(event.pointerId);
                }
                buttons[event.button] = true;
                x = event.offsetX;
                y = event.offsetY;
            } else if (event.pointerType === 'touch') {
                if (touches.length === 0) {
                    target.setPointerCapture(event.pointerId);
                }
                touches.push({
                    x: event.offsetX,
                    y: event.offsetY,
                    id: event.pointerId
                });

                if (touches.length === 2) {
                    midx = (touches[0].x + touches[1].x) * 0.5;
                    midy = (touches[0].y + touches[1].y) * 0.5;
                    midlen = dist(touches[0].x, touches[0].y, touches[1].x, touches[1].y);
                }
            }
        };

        const pointerup = (event: PointerEvent) => {
            if (event.pointerType === 'mouse') {
                buttons[event.button] = false;
                if (buttons.every(b => !b)) {
                    target.releasePointerCapture(event.pointerId);
                }
            } else {
                touches = touches.filter((touch) => touch.id !== event.pointerId);
                if (touches.length === 0) {
                    target.setPointerCapture(event.pointerId);
                }
            }
        };

        const pointermove = (event: PointerEvent) => {
            if (event.pointerType === 'mouse') {
                const dx = event.offsetX - x;
                const dy = event.offsetY - y;
                x = event.offsetX;
                y = event.offsetY;

                if (buttons[0]) {
                    orbit(dx, dy);
                } else if (buttons[1]) {
                    zoom(dy * -0.02);
                } else if (buttons[2]) {
                    pan(x, y, dx, dy);
                }
            } else {
                if (touches.length === 1) {
                    const touch = touches[0];
                    const dx = event.offsetX - touch.x;
                    const dy = event.offsetY - touch.y;
                    touch.x = event.offsetX;
                    touch.y = event.offsetY;
                    orbit(dx, dy);
                } else if (touches.length === 2) {
                    const touch = touches[touches.map(t => t.id).indexOf(event.pointerId)];
                    touch.x = event.offsetX;
                    touch.y = event.offsetY;
 
                    const mx = (touches[0].x + touches[1].x) * 0.5;
                    const my = (touches[0].y + touches[1].y) * 0.5;
                    const ml = dist(touches[0].x, touches[0].y, touches[1].x, touches[1].y);

                    pan(mx, my, (mx - midx), (my - midy));
                    zoom((ml - midlen) * 0.01);

                    midx = mx;
                    midy = my;
                    midlen = ml;
                }
            }
        };

        const wheel = (event: WheelEvent) => {
            event.preventDefault();
            const sign = (v: number) => v > 0 ? 1 : v < 0 ? -1 : 0;
            zoom(sign(event.deltaY) * -0.2);
            orbit(sign(event.deltaX) * 2.0, 0);
        };

        const dblclick = (event: globalThis.MouseEvent) => {
            camera.pickFocalPoint(event.offsetX, event.offsetY);
        };

        const contextmenu = (event: globalThis.MouseEvent) => {
            event.preventDefault();
        };

        target.addEventListener('pointerdown', pointerdown);
        target.addEventListener('pointerup', pointerup);
        target.addEventListener('pointermove', pointermove);
        target.addEventListener('wheel', wheel);
        target.addEventListener('dblclick', dblclick);
        target.addEventListener('contextmenu', contextmenu);

        this.destroy = () => {
            target.removeEventListener('pointerdown', pointerdown);
            target.removeEventListener('pointerup', pointerup);
            target.removeEventListener('pointermove', pointermove);
            target.removeEventListener('wheel', wheel);
            target.removeEventListener('dblclick', dblclick);
            target.removeEventListener('contextmenu', contextmenu);
        };
    }
}

export { PointerController };
