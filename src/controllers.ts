import { Camera } from './camera';
import { Vec3 } from 'playcanvas';

const fromWorldPoint = new Vec3();
const toWorldPoint = new Vec3();
const worldDiff = new Vec3();

// calculate the distance between two 2d points
const dist = (x0: number, y0: number, x1: number, y1: number) => Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2);

class PointerController {
    update: (deltaTime: number) => void;
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
            const distance = camera.distanceTween.value.distance * camera.sceneRadius / camera.fovFactor;

            c.screenToWorld(x, y, distance, fromWorldPoint);
            c.screenToWorld(x - dx, y - dy, distance, toWorldPoint);

            worldDiff.sub2(toWorldPoint, fromWorldPoint);
            worldDiff.add(camera.focalPoint);

            camera.setFocalPoint(worldDiff);
        };

        const zoom = (amount: number) => {
            camera.setDistance(camera.distance - (camera.distance * 0.999 + 0.001) * amount * camera.scene.config.controls.zoomSensitivity, 2);
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
                    target.releasePointerCapture(event.pointerId);
                }
            }
        };

        const pointermove = (event: PointerEvent) => {
            if (event.pointerType === 'mouse') {
                const dx = event.offsetX - x;
                const dy = event.offsetY - y;
                x = event.offsetX;
                y = event.offsetY;

                // right button can be used to orbit with ctrl key and to zoom with alt | meta key
                const mod = buttons[2] ?
                    (event.shiftKey || event.ctrlKey ? 'orbit' :
                        (event.altKey || event.metaKey ? 'zoom' : null)) :
                            null;

                if (mod === 'orbit' || (mod === null && buttons[0])) {
                    orbit(dx, dy);
                } else if (mod === 'zoom' || (mod === null && buttons[1])) {
                    zoom(dy * -0.02);
                } else if (mod === 'pan' || (mod === null && buttons[2])) {
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

        // fuzzy detection of mouse wheel events vs trackpad events
        const isMouseEvent = (deltaX: number, deltaY: number) => {
            return (Math.abs(deltaX) > 50 && deltaY === 0) ||
                   (Math.abs(deltaY) > 50 && deltaX === 0) ||
                   (deltaX === 0 && deltaY !== 0) && !Number.isInteger(deltaY);
        };

        const wheel = (event: WheelEvent) => {
            const { deltaX, deltaY } = event;

            if (isMouseEvent(deltaX, deltaY)) {
                zoom(deltaY * -0.002);
            } else if (event.ctrlKey || event.metaKey) {
                zoom(deltaY * -0.02);
            } else if (event.shiftKey) {
                pan(event.offsetX, event.offsetY, deltaX, deltaY);
            } else {
                orbit(deltaX, deltaY);
            }

            event.preventDefault();
        };

        // FIXME: safari sends canvas as target of dblclick event but chrome sends the target element
        const canvas = camera.scene.app.graphicsDevice.canvas;

        const dblclick = (event: globalThis.MouseEvent) => {
            if (event.target === target || event.target === canvas) {
                camera.pickFocalPoint(event.offsetX, event.offsetY);
            }
        };

        // key state
        const keys: any = {
            ArrowUp: 0,
            ArrowDown: 0,
            ArrowLeft: 0,
            ArrowRight: 0
        };

        const keydown = (event: KeyboardEvent) => {
            if (keys.hasOwnProperty(event.key) && event.target === document.body) {
                keys[event.key] = event.shiftKey ? 10 : (event.ctrlKey || event.metaKey || event.altKey ? 0.1 : 1);
            }
        };

        const keyup = (event: KeyboardEvent) => {
            if (keys.hasOwnProperty(event.key)) {
                keys[event.key] = 0;
            }
        };

        this.update = (deltaTime: number) => {
            const x = keys.ArrowRight - keys.ArrowLeft;
            const z = keys.ArrowDown - keys.ArrowUp;

            if (x || z) {
                const factor = deltaTime * camera.distance * camera.sceneRadius * 20;
                const worldTransform = camera.entity.getWorldTransform();
                const xAxis = worldTransform.getX().mulScalar(x * factor);
                const zAxis = worldTransform.getZ().mulScalar(z * factor);
                const p = camera.focalPoint.add(xAxis).add(zAxis);
                camera.setFocalPoint(p);
            }
        };

        let destroy: () => void = null;

        const wrap = (target: any, name: string, fn: any, options?: any) => {
            const callback = (event: any) => {
                camera.scene.events.fire('camera.controller', name);
                fn(event);
            };
            target.addEventListener(name, callback, options);
            destroy = () => {
                destroy?.();
                target.removeEventListener(name, callback);
            };
        };

        wrap(target, 'pointerdown', pointerdown);
        wrap(target, 'pointerup', pointerup);
        wrap(target, 'pointermove', pointermove);
        wrap(target, 'wheel', wheel, { passive: false });
        wrap(target, 'dblclick', dblclick);
        wrap(document, 'keydown', keydown);
        wrap(document, 'keyup', keyup);

        this.destroy = destroy;
    }
}

export { PointerController };
