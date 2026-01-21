import { Vec3 } from 'playcanvas';

import { Camera } from './camera';

const fromWorldPoint = new Vec3();
const toWorldPoint = new Vec3();
const worldDiff = new Vec3();
const moveVec = new Vec3();
const forwardVec = new Vec3();

// calculate the distance between two 2d points
const dist = (x0: number, y0: number, x1: number, y1: number) => Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2);

class PointerController {
    update: (deltaTime: number) => void;
    destroy: () => void;

    constructor(camera: Camera, target: HTMLElement) {

        // Orbit mode: rotate camera around the focal point
        const orbit = (dx: number, dy: number) => {
            const azim = camera.azim - dx * camera.scene.config.controls.orbitSensitivity;
            const elev = camera.elevation - dy * camera.scene.config.controls.orbitSensitivity;
            camera.setAzimElev(azim, elev);
        };

        // Fly mode: rotate camera around itself (keep camera position fixed)
        const look = (dx: number, dy: number) => {
            // Use TARGET values to calculate target camera position (not current interpolated)
            const distance = camera.distance * camera.sceneRadius / camera.fovFactor;

            // Calculate target camera position from target focal point and angles
            Camera.calcForwardVec(forwardVec, camera.azim, camera.elevation);
            const targetCameraPos = camera.focalPoint.add(forwardVec.clone().mulScalar(distance));

            // Calculate new azim/elev
            const azim = camera.azim - dx * camera.scene.config.controls.orbitSensitivity;
            const elev = camera.elevation - dy * camera.scene.config.controls.orbitSensitivity;

            // Calculate the new forward vector based on new angles
            Camera.calcForwardVec(forwardVec, azim, elev);

            // Calculate new focal point to keep camera at target position
            // Camera position = focalPoint + forwardVec * distance
            // So: focalPoint = cameraPosition - forwardVec * distance
            const newFocalPoint = targetCameraPos.clone().sub(forwardVec.clone().mulScalar(distance));

            camera.setAzimElev(azim, elev);
            camera.setFocalPoint(newFocalPoint);
        };

        const pan = (x: number, y: number, dx: number, dy: number) => {
            // For panning to work at any zoom level, we use screen point to world projection
            // to work out how far we need to pan the pivotEntity in world space
            const c = camera.camera;
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
        let pressedButton = -1;  // no button pressed, otherwise 0, 1, or 2
        let x: number, y: number;

        // touch state
        let touches: { id: number, x: number, y: number}[] = [];
        let midx: number, midy: number, midlen: number;

        const pointerdown = (event: PointerEvent) => {
            if (event.pointerType === 'mouse') {
                // If a button is already pressed, ignore this press
                if (pressedButton !== -1) {
                    return;
                }
                target.setPointerCapture(event.pointerId);
                pressedButton = event.button;
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
                // Only release if this is the button that was initially pressed
                if (event.button === pressedButton) {
                    pressedButton = -1;
                    target.releasePointerCapture(event.pointerId);
                }
            } else {
                touches = touches.filter(touch => touch.id !== event.pointerId);
                if (touches.length === 0) {
                    target.releasePointerCapture(event.pointerId);
                }
            }
        };

        const pointermove = (event: PointerEvent) => {
            if (event.pointerType === 'mouse') {
                // Only process if we're tracking a button
                if (pressedButton === -1) {
                    return;
                }

                // Verify the button we're tracking is still pressed
                // 1 = left button, 4 = middle button, 2 = right button
                const buttonMask = [1, 4, 2][pressedButton];
                if ((event.buttons & buttonMask) === 0) {
                    // Button is no longer pressed, clean up
                    pressedButton = -1;
                    return;
                }

                const dx = event.offsetX - x;
                const dy = event.offsetY - y;
                x = event.offsetX;
                y = event.offsetY;

                if (camera.controlMode === 'fly') {
                    // Fly mode: left-drag to look around, middle to zoom, right works same as orbit
                    if (pressedButton === 0) {
                        look(dx, dy);
                    } else if (pressedButton === 1) {
                        zoom(dy * -0.02);
                    } else if (pressedButton === 2) {
                        // Right button: same behavior as orbit mode
                        const mod = event.shiftKey || event.ctrlKey ? 'look' :
                            (event.altKey || event.metaKey ? 'zoom' : 'pan');

                        if (mod === 'look') {
                            look(dx, dy);
                        } else if (mod === 'zoom') {
                            zoom(dy * -0.02);
                        } else {
                            pan(x, y, dx, dy);
                        }
                    }
                } else {
                    // Orbit mode: existing behavior
                    // right button can be used to orbit with ctrl key and to zoom with alt | meta key
                    const mod = pressedButton === 2 ?
                        (event.shiftKey || event.ctrlKey ? 'orbit' :
                            (event.altKey || event.metaKey ? 'zoom' : null)) :
                        null;

                    if (mod === 'orbit' || (mod === null && pressedButton === 0)) {
                        orbit(dx, dy);
                    } else if (mod === 'zoom' || (mod === null && pressedButton === 1)) {
                        zoom(dy * -0.02);
                    } else if (mod === 'pan' || (mod === null && pressedButton === 2)) {
                        pan(x, y, dx, dy);
                    }
                }
            } else {
                if (touches.length === 1) {
                    const touch = touches[0];
                    const dx = event.offsetX - touch.x;
                    const dy = event.offsetY - touch.y;
                    touch.x = event.offsetX;
                    touch.y = event.offsetY;

                    if (camera.controlMode === 'fly') {
                        look(dx, dy);
                    } else {
                        orbit(dx, dy);
                    }
                } else if (touches.length === 2) {
                    const touch = touches[touches.map(t => t.id).indexOf(event.pointerId)];
                    touch.x = event.offsetX;
                    touch.y = event.offsetY;

                    const mx = (touches[0].x + touches[1].x) * 0.5;
                    const my = (touches[0].y + touches[1].y) * 0.5;
                    const ml = dist(touches[0].x, touches[0].y, touches[1].x, touches[1].y);

                    if (camera.controlMode === 'fly') {
                        // In fly mode, pinch moves forward/backward by moving focal point
                        const zoomDelta = (ml - midlen) * 0.01;
                        const worldTransform = camera.mainCamera.getWorldTransform();
                        const zAxis = worldTransform.getZ();
                        moveVec.copy(zAxis).mulScalar(-zoomDelta * camera.flySpeed);
                        const p = camera.focalPoint.add(moveVec);
                        camera.setFocalPoint(p);
                    } else {
                        pan(mx, my, (mx - midx), (my - midy));
                        zoom((ml - midlen) * 0.01);
                    }

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

            if (camera.controlMode === 'fly') {
                // Fly mode: wheel moves forward/backward by moving focal point
                const factor = camera.flySpeed * 0.01;
                const worldTransform = camera.mainCamera.getWorldTransform();
                const zAxis = worldTransform.getZ();
                moveVec.copy(zAxis).mulScalar(deltaY * factor);
                const p = camera.focalPoint.add(moveVec);
                camera.setFocalPoint(p);
            } else {
                // Orbit mode: existing behavior
                if (isMouseEvent(deltaX, deltaY)) {
                    zoom(deltaY * -0.002);
                } else if (event.ctrlKey || event.metaKey) {
                    zoom(deltaY * -0.02);
                } else if (event.shiftKey) {
                    pan(event.offsetX, event.offsetY, deltaX, deltaY);
                } else {
                    orbit(deltaX, deltaY);
                }
            }

            event.preventDefault();
        };

        // FIXME: safari sends canvas as target of dblclick event but chrome sends the target element
        const canvas = camera.scene.app.graphicsDevice.canvas;

        const dblclick = (event: globalThis.MouseEvent) => {
            if (event.target === target || event.target === canvas) {
                // Switch to orbit mode when double-clicking to focus
                if (camera.controlMode === 'fly') {
                    camera.scene.events.fire('camera.setControlMode', 'orbit');
                }
                camera.pickFocalPoint(event.offsetX / target.clientWidth, event.offsetY / target.clientHeight);
            }
        };

        // fly movement state (updated via shortcut events)
        let flyForward = false;
        let flyBackward = false;
        let flyLeft = false;
        let flyRight = false;
        let flyDown = false;
        let flyUp = false;

        // track modifier keys for speed control (updated via shortcut events)
        let fastDown = false;
        let slowDown = false;

        // Clear all keys when window loses focus to prevent stuck keys
        const clearAllKeys = () => {
            flyForward = false;
            flyBackward = false;
            flyLeft = false;
            flyRight = false;
            flyDown = false;
            flyUp = false;
            fastDown = false;
            slowDown = false;
        };

        // Helper to switch to fly mode when a fly key is pressed
        const handleFlyKey = (down: boolean) => {
            if (down && camera.controlMode !== 'fly') {
                camera.scene.events.fire('camera.setControlMode', 'fly');
            }
        };

        // Listen for fly movement shortcut events
        const events = camera.scene.events;

        const onFlyForward = (down: boolean) => {
            flyForward = down;
            handleFlyKey(down);
        };
        const onFlyBackward = (down: boolean) => {
            flyBackward = down;
            handleFlyKey(down);
        };
        const onFlyLeft = (down: boolean) => {
            flyLeft = down;
            handleFlyKey(down);
        };
        const onFlyRight = (down: boolean) => {
            flyRight = down;
            handleFlyKey(down);
        };
        const onFlyDown = (down: boolean) => {
            flyDown = down;
            handleFlyKey(down);
        };
        const onFlyUp = (down: boolean) => {
            flyUp = down;
            handleFlyKey(down);
        };
        const onModifierFast = (down: boolean) => {
            fastDown = down;
        };
        const onModifierSlow = (down: boolean) => {
            slowDown = down;
        };

        events.on('camera.fly.forward', onFlyForward);
        events.on('camera.fly.backward', onFlyBackward);
        events.on('camera.fly.left', onFlyLeft);
        events.on('camera.fly.right', onFlyRight);
        events.on('camera.fly.down', onFlyDown);
        events.on('camera.fly.up', onFlyUp);
        events.on('camera.modifier.fast', onModifierFast);
        events.on('camera.modifier.slow', onModifierSlow);

        this.update = (deltaTime: number) => {
            if (camera.controlMode !== 'fly') return;

            // Fly mode: WASD for movement, Q/E for up/down - moves focal point
            const forward = (flyForward ? 1 : 0) - (flyBackward ? 1 : 0);
            const strafe = (flyRight ? 1 : 0) - (flyLeft ? 1 : 0);
            const vertical = (flyUp ? 1 : 0) - (flyDown ? 1 : 0);

            if (forward || strafe || vertical) {
                // Calculate speed modifier based on current modifier key state
                const speedMod = fastDown ? 10 : (slowDown ? 0.1 : 1);
                const factor = deltaTime * camera.flySpeed * speedMod;
                const worldTransform = camera.worldTransform;

                moveVec.set(0, 0, 0);

                // Forward/backward along horizontal forward direction (fixed Y)
                if (forward) {
                    const zAxis = worldTransform.getZ();
                    zAxis.y = 0;
                    zAxis.normalize();
                    moveVec.add(zAxis.mulScalar(-forward * factor));
                }

                // Strafe left/right (horizontal)
                if (strafe) {
                    const xAxis = worldTransform.getX();
                    xAxis.y = 0;
                    xAxis.normalize();
                    moveVec.add(xAxis.mulScalar(strafe * factor));
                }

                // Up/down in world space
                if (vertical) {
                    moveVec.y += vertical * factor;
                }

                // Move the focal point (camera follows due to orbit calculation)
                const p = camera.focalPoint.add(moveVec);
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
        wrap(window, 'blur', clearAllKeys);

        this.destroy = () => {
            destroy?.();
            events.off('camera.fly.forward', onFlyForward);
            events.off('camera.fly.backward', onFlyBackward);
            events.off('camera.fly.left', onFlyLeft);
            events.off('camera.fly.right', onFlyRight);
            events.off('camera.fly.down', onFlyDown);
            events.off('camera.fly.up', onFlyUp);
            events.off('camera.modifier.fast', onModifierFast);
            events.off('camera.modifier.slow', onModifierSlow);
        };
    }
}

export { PointerController };
