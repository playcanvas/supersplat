import { Vec3 } from 'playcanvas';

import { Camera } from './camera';

const fromWorldPoint = new Vec3();
const toWorldPoint = new Vec3();
const worldDiff = new Vec3();
const moveVec = new Vec3();

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

        const look = (dx: number, dy: number) => {
            camera.look(dx, dy);
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

        // middle-mouse click-vs-drag tracking (for MMB single-click to focus)
        const CLICK_DRAG_THRESHOLD = 4;
        let mmbStartX = 0, mmbStartY = 0, mmbDragged = false;

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
                if (pressedButton === 1) {
                    mmbStartX = x;
                    mmbStartY = y;
                    mmbDragged = false;
                }
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
                    // MMB tap (no significant movement) -> focus on cursor point (orbit only; fly uses MMB for zoom)
                    if (pressedButton === 1 && camera.controlMode === 'orbit' && !mmbDragged) {
                        camera.pickFocalPoint(event.offsetX / target.clientWidth, event.offsetY / target.clientHeight);
                    }
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
                    // Orbit mode:
                    // - left button: orbit
                    // - middle button (Blender-style): orbit, Shift -> pan, Ctrl -> zoom
                    //   (gated on a small drag threshold so a tap can be used to focus on release)
                    // - right button: pan, Shift/Ctrl -> orbit, Alt/Meta -> zoom
                    if (pressedButton === 1 && !mmbDragged) {
                        if (dist(event.offsetX, event.offsetY, mmbStartX, mmbStartY) < CLICK_DRAG_THRESHOLD) {
                            return;
                        }
                        mmbDragged = true;
                    }

                    let mod: 'orbit' | 'pan' | 'zoom';
                    if (pressedButton === 2) {
                        mod = event.shiftKey || event.ctrlKey ? 'orbit' :
                            (event.altKey || event.metaKey ? 'zoom' : 'pan');
                    } else if (pressedButton === 1) {
                        mod = event.shiftKey ? 'pan' :
                            (event.ctrlKey ? 'zoom' : 'orbit');
                    } else {
                        mod = 'orbit';
                    }

                    if (mod === 'orbit') {
                        orbit(dx, dy);
                    } else if (mod === 'zoom') {
                        zoom(dy * -0.02);
                    } else {
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

        // Distinguish a physical mouse wheel from a trackpad two-finger
        // scroll. A single wheel event is unreliable (Magic Mouse, hi-res
        // mice, and macOS Shift-remapping all confuse per-event heuristics),
        // so we classify on the first event of a burst and let the rest of
        // the burst inherit that label. A burst is a run of wheel events
        // separated by less than BURST_GAP_MS - trackpads stream at ~60Hz
        // (~16ms), wheels emit one event per notch (typically >>50ms apart).
        const BURST_GAP_MS = 80;
        let lastWheelTime = 0;
        let burstIsWheel = false;

        const classifyWheel = (event: WheelEvent) => {
            // Line/page-mode events are always physical wheels (Firefox).
            if (event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) {
                return true;
            }
            const { deltaX, deltaY } = event;
            // Trackpads regularly scroll on both axes simultaneously; real
            // wheels emit single-axis motion per notch.
            if (deltaX !== 0 && deltaY !== 0) {
                return false;
            }
            // Trackpads (and Magic Mouse) emit fractional pixel deltas;
            // physical wheels emit integer pixel deltas.
            if (!Number.isInteger(deltaX) || !Number.isInteger(deltaY)) {
                return false;
            }
            return true;
        };

        const wheel = (event: WheelEvent) => {
            const now = performance.now();
            if (now - lastWheelTime > BURST_GAP_MS) {
                burstIsWheel = classifyWheel(event);
            }
            lastWheelTime = now;

            const { deltaX, deltaY } = event;

            if (camera.controlMode === 'fly') {
                // Fly mode: wheel moves forward/backward by moving focal point
                const factor = camera.flySpeed * 0.01;
                const worldTransform = camera.mainCamera.getWorldTransform();
                const zAxis = worldTransform.getZ();
                moveVec.copy(zAxis).mulScalar(deltaY * factor);
                const p = camera.focalPoint.add(moveVec);
                camera.setFocalPoint(p);
            } else if (burstIsWheel) {
                // Some browsers (notably Safari/Firefox on macOS) remap a
                // vertical mouse wheel to deltaX when Shift is held. Use
                // whichever axis carries motion so shift+wheel still zooms.
                zoom((deltaY || deltaX) * -0.002);
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
