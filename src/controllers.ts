import { Vec3 } from 'playcanvas';

import type { Camera } from './camera';

const fromWorldPoint = new Vec3();
const toWorldPoint = new Vec3();
const worldDiff = new Vec3();
const moveVec = new Vec3();
const freeMove = new Vec3();

// free-camera movement uses the same world-units-per-second rate as fly mode
// (scaled by the shared fly speed setting, the free-mode sensitivity and the
// fast/slow modifiers). rotation base speed lives on the camera so the
// free-camera settings can adjust it live.
const FREE_ROTATE_FAST = 4;
const FREE_ROTATE_SLOW = 0.25;

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
            const distance = (camera.distanceTween.value.distance * camera.sceneRadius) / camera.fovFactor;

            c.screenToWorld(x, y, distance, fromWorldPoint);
            c.screenToWorld(x - dx, y - dy, distance, toWorldPoint);

            worldDiff.sub2(toWorldPoint, fromWorldPoint);
            worldDiff.add(camera.focalPoint);

            camera.setFocalPoint(worldDiff);
        };

        const zoom = (amount: number) => {
            camera.setDistance(
                camera.distance -
                    (camera.distance * 0.999 + 0.001) * amount * camera.scene.config.controls.zoomSensitivity,
                2
            );
        };

        const pickFocalPoint = (event: MouseEvent) => {
            const rect = target.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                camera.pickFocalPoint(
                    (event.clientX - rect.left) / rect.width,
                    (event.clientY - rect.top) / rect.height
                );
            }
        };

        // mouse state
        let pressedButton = -1; // no button pressed, otherwise 0, 1, or 2
        let x: number, y: number;

        // middle-mouse click-vs-drag tracking (for MMB single-click to focus)
        const CLICK_DRAG_THRESHOLD = 4;
        let mmbStartX = 0,
            mmbStartY = 0,
            mmbDragged = false;

        // touch state
        let touches: { id: number; x: number; y: number }[] = [];
        let midx: number, midy: number, midlen: number;

        const pointerdown = (event: PointerEvent) => {
            // free mode is keyboard-only: the mouse belongs to the editing tools
            if (camera.controlMode === 'free') {
                return;
            }

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
                // Only release if this is the button that was initially pressed.
                // pointercancel carries button -1, so it releases whatever is held
                if (event.button === pressedButton || event.type === 'pointercancel') {
                    // MMB tap (no significant movement) -> focus on cursor point (orbit only)
                    if (
                        pressedButton === 1 &&
                        camera.controlMode === 'orbit' &&
                        !mmbDragged &&
                        event.type === 'pointerup'
                    ) {
                        pickFocalPoint(event);
                    }
                    pressedButton = -1;
                    if (target.hasPointerCapture(event.pointerId)) {
                        target.releasePointerCapture(event.pointerId);
                    }
                }
            } else {
                touches = touches.filter((touch) => touch.id !== event.pointerId);
                if (touches.length === 0 && target.hasPointerCapture(event.pointerId)) {
                    target.releasePointerCapture(event.pointerId);
                }
            }
        };

        const pointermove = (event: PointerEvent) => {
            // free mode is keyboard-only: the mouse belongs to the editing tools
            if (camera.controlMode === 'free') {
                return;
            }

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
                    // Fly mode: left-drag to look around; middle and right work as
                    // in orbit mode, with look in place of orbit
                    if (pressedButton === 0) {
                        look(dx, dy);
                    } else if (pressedButton === 1) {
                        // middle button (Blender-style): look, Shift -> pan, Ctrl -> zoom
                        const mod = event.shiftKey ? 'pan' : event.ctrlKey ? 'zoom' : 'look';

                        if (mod === 'look') {
                            look(dx, dy);
                        } else if (mod === 'zoom') {
                            zoom(dy * -0.02);
                        } else {
                            pan(x, y, dx, dy);
                        }
                    } else if (pressedButton === 2) {
                        // Right button: same behavior as orbit mode
                        const mod =
                            event.shiftKey || event.ctrlKey ? 'look' : event.altKey || event.metaKey ? 'zoom' : 'pan';

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
                        mod =
                            event.shiftKey || event.ctrlKey ? 'orbit' : event.altKey || event.metaKey ? 'zoom' : 'pan';
                    } else if (pressedButton === 1) {
                        mod = event.shiftKey ? 'pan' : event.ctrlKey ? 'zoom' : 'orbit';
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
                    // a touch whose pointerdown landed elsewhere (a tool overlay
                    // that was then hidden) is not one of ours
                    if (touch.id !== event.pointerId) {
                        return;
                    }
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
                    const touch = touches[touches.map((t) => t.id).indexOf(event.pointerId)];
                    // a touch whose pointerdown landed elsewhere (a tool overlay
                    // that was then hidden) is not one of ours
                    if (!touch) {
                        return;
                    }
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
                        pan(mx, my, mx - midx, my - midy);
                        zoom((ml - midlen) * 0.01);
                    }

                    midx = mx;
                    midy = my;
                    midlen = ml;
                }
            }
        };

        // A physical mouse wheel and a trackpad two-finger swipe are
        // indistinguishable from their wheel-event deltas alone - every
        // per-event heuristic (wheelDelta % 120, deltaMode, fractional or
        // diagonal deltas) misfires on hi-res mice and in momentum tails
        // (see issue #919). The one reliable trackpad signal the platform
        // gives us is the macOS-synthesized pinch: a wheel event with
        // ctrlKey set while the physical Ctrl key is *not* held. So we no
        // longer classify the device and instead drive everything from
        // modifier keys, treating a bare scroll as zoom regardless of device:
        //
        // | Input                       | Action |
        // |-----------------------------|--------|
        // | Bare scroll (wheel / swipe) | zoom   |
        // | Pinch (synthetic Ctrl)      | zoom   |
        // | Physical Ctrl + scroll      | orbit  |
        // | Shift + scroll              | pan    |

        // Track the physical Ctrl key so we can tell a real Ctrl+scroll
        // (orbit) from a macOS pinch (zoom). Listeners live on window so they
        // fire regardless of which element currently has focus.
        let ctrlDown = false;
        const keydown = (event: KeyboardEvent) => {
            if (event.key === 'Control') ctrlDown = true;
        };
        const keyup = (event: KeyboardEvent) => {
            if (event.key === 'Control') ctrlDown = false;
        };

        const wheel = (event: WheelEvent) => {
            // free mode is keyboard-only; swallow the wheel so the page
            // doesn't scroll but leave the camera alone
            if (camera.controlMode === 'free') {
                event.preventDefault();
                return;
            }

            const { deltaX, deltaY } = event;

            // Some browsers (notably Safari/Firefox on macOS) remap a vertical
            // mouse wheel to deltaX when Shift is held. Only fall back to
            // deltaX for that remapped case so horizontal-only scrolling
            // (tilt wheel, horizontal trackpad swipe) is not treated as
            // zoom / fly movement.
            const wheelDelta = event.shiftKey && deltaY === 0 ? deltaX : deltaY;

            // Synthetic Ctrl (macOS/Magic Mouse pinch) or Cmd: fine zoom.
            // Physical Ctrl held down: orbit.
            const isPinch = (event.ctrlKey && !ctrlDown) || event.metaKey;
            const isOrbit = event.ctrlKey && ctrlDown;

            if (camera.controlMode === 'fly') {
                if (isOrbit) {
                    look(deltaX, deltaY);
                } else if (event.shiftKey) {
                    pan(event.offsetX, event.offsetY, deltaX, deltaY);
                } else if (camera.ortho) {
                    // moving forward/backward has no visual effect in ortho
                    // (ortho height derives from distance), so zoom instead,
                    // with the same pinch/scroll factors as the orbit path
                    zoom(isPinch ? deltaY * -0.02 : wheelDelta * -0.002);
                } else {
                    // Bare scroll / pinch: move focal point forward/backward
                    const factor = camera.flySpeed * 0.01;
                    const worldTransform = camera.mainCamera.getWorldTransform();
                    const zAxis = worldTransform.getZ();
                    moveVec.copy(zAxis).mulScalar(wheelDelta * factor);
                    const p = camera.focalPoint.add(moveVec);
                    camera.setFocalPoint(p);
                }
            } else if (isOrbit) {
                orbit(deltaX, deltaY);
            } else if (event.shiftKey) {
                pan(event.offsetX, event.offsetY, deltaX, deltaY);
            } else if (isPinch) {
                zoom(deltaY * -0.02);
            } else {
                zoom(wheelDelta * -0.002);
            }

            event.preventDefault();
        };

        // FIXME: safari sends canvas as target of dblclick event but chrome sends the target element
        const canvas = camera.scene.app.graphicsDevice.canvas;

        const dblclick = (event: globalThis.MouseEvent) => {
            // free mode is keyboard-only; double-click must not yank the
            // camera back to orbit
            if (camera.controlMode === 'free') {
                return;
            }

            if (event.target === target || event.target === canvas) {
                // Switch to orbit mode when double-clicking to focus
                if (camera.controlMode === 'fly') {
                    camera.scene.events.fire('camera.setControlMode', 'orbit');
                }
                pickFocalPoint(event);
            }
        };

        // movement key state, shared by fly and free modes. the shortcut
        // table routes the same held keys to camera.move.* for both modes;
        // the mode decides which camera property they move.
        let moveForward = false;
        let moveBackward = false;
        let moveLeft = false;
        let moveRight = false;
        let moveDown = false;
        let moveUp = false;

        // free-mode look state (IJKL/UO)
        const freeLook = {
            pitchUp: false,
            pitchDown: false,
            yawLeft: false,
            yawRight: false,
            rollCW: false,
            rollCCW: false
        };

        const clearMoveKeys = () => {
            moveForward = false;
            moveBackward = false;
            moveLeft = false;
            moveRight = false;
            moveDown = false;
            moveUp = false;
        };

        const clearFreeLook = () => {
            freeLook.pitchUp = false;
            freeLook.pitchDown = false;
            freeLook.yawLeft = false;
            freeLook.yawRight = false;
            freeLook.rollCW = false;
            freeLook.rollCCW = false;
        };

        // track modifier keys for speed control (updated via shortcut events)
        let fastDown = false;
        let slowDown = false;

        // Clear all keys when window loses focus to prevent stuck keys
        const clearAllKeys = () => {
            clearMoveKeys();
            clearFreeLook();
            fastDown = false;
            slowDown = false;
            ctrlDown = false;
        };

        // pressing a movement key in orbit mode switches to fly; free mode
        // keeps its own camera
        const handleMoveKey = (down: boolean) => {
            if (down && camera.controlMode === 'orbit') {
                camera.scene.events.fire('camera.setControlMode', 'fly');
            }
        };

        // Listen for shared movement and modifier shortcut events
        const events = camera.scene.events;

        const onControlMode = () => {
            // movement keys are shared, so they survive a mode switch (e.g.
            // the orbit -> fly auto-switch happens on the same key press).
            // free look keys are mode-specific, so they must not leak.
            clearFreeLook();
        };
        events.on('camera.controlMode', onControlMode);

        const onMoveForward = (down: boolean) => {
            moveForward = down;
            handleMoveKey(down);
        };
        const onMoveBackward = (down: boolean) => {
            moveBackward = down;
            handleMoveKey(down);
        };
        const onMoveLeft = (down: boolean) => {
            moveLeft = down;
            handleMoveKey(down);
        };
        const onMoveRight = (down: boolean) => {
            moveRight = down;
            handleMoveKey(down);
        };
        const onMoveDown = (down: boolean) => {
            moveDown = down;
            handleMoveKey(down);
        };
        const onMoveUp = (down: boolean) => {
            moveUp = down;
            handleMoveKey(down);
        };
        const onModifierFast = (down: boolean) => {
            fastDown = down;
        };
        const onModifierSlow = (down: boolean) => {
            slowDown = down;
        };

        events.on('camera.move.forward', onMoveForward);
        events.on('camera.move.backward', onMoveBackward);
        events.on('camera.move.left', onMoveLeft);
        events.on('camera.move.right', onMoveRight);
        events.on('camera.move.down', onMoveDown);
        events.on('camera.move.up', onMoveUp);
        events.on('camera.modifier.fast', onModifierFast);
        events.on('camera.modifier.slow', onModifierSlow);

        // free-mode look keys
        const freeLookBindings: [string, keyof typeof freeLook][] = [
            ['camera.free.lookUp', 'pitchUp'],
            ['camera.free.lookDown', 'pitchDown'],
            ['camera.free.yawLeft', 'yawLeft'],
            ['camera.free.yawRight', 'yawRight'],
            ['camera.free.rollCW', 'rollCW'],
            ['camera.free.rollCCW', 'rollCCW']
        ];
        const freeLookHandlers = freeLookBindings.map(([name, key]) => {
            const handler = (down: boolean) => {
                freeLook[key] = down;
            };
            events.on(name, handler);
            return { name, handler };
        });

        const moveSpeedMod = () => (fastDown ? 10 : slowDown ? 0.1 : 1);

        const updateFree = (deltaTime: number) => {
            // clamp dt so a stalled tab doesn't teleport the camera
            const dt = Math.min(deltaTime, 0.1);

            // rotate about the camera's own axes
            const rotateMod = fastDown ? FREE_ROTATE_FAST : slowDown ? FREE_ROTATE_SLOW : 1;
            const angle = camera.freeRotateSpeed * rotateMod * dt;
            const pitch = ((freeLook.pitchUp ? 1 : 0) - (freeLook.pitchDown ? 1 : 0)) * angle;
            const yaw = ((freeLook.yawLeft ? 1 : 0) - (freeLook.yawRight ? 1 : 0)) * angle;
            const roll = ((freeLook.rollCW ? 1 : 0) - (freeLook.rollCCW ? 1 : 0)) * angle;
            if (pitch !== 0 || yaw !== 0 || roll !== 0) {
                camera.rotateFree(pitch, yaw, roll);
            }

            // move along the camera's own axes at the same rate as fly mode,
            // scaled by the free-mode sensitivity
            const speed = dt * camera.flySpeed * camera.freeMoveSensitivity * moveSpeedMod();
            const strafe = (moveRight ? 1 : 0) - (moveLeft ? 1 : 0);
            const rise = (moveUp ? 1 : 0) - (moveDown ? 1 : 0);
            const advance = (moveForward ? 1 : 0) - (moveBackward ? 1 : 0);
            if (strafe !== 0 || rise !== 0 || advance !== 0) {
                // local axes: +x right, +y up, -z forward
                camera.translateFree(freeMove.set(strafe, rise, -advance).mulScalar(speed));
            }
        };

        this.update = (deltaTime: number) => {
            if (camera.controlMode === 'free') {
                updateFree(deltaTime);
                return;
            }

            if (camera.controlMode !== 'fly') return;

            // Fly mode: WASD for movement, Q/E for up/down - moves focal point
            const forward = (moveForward ? 1 : 0) - (moveBackward ? 1 : 0);
            const strafe = (moveRight ? 1 : 0) - (moveLeft ? 1 : 0);
            const vertical = (moveUp ? 1 : 0) - (moveDown ? 1 : 0);

            if (forward || strafe || vertical) {
                // Calculate speed modifier based on current modifier key state
                const factor = deltaTime * camera.flySpeed * moveSpeedMod();
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

        const wrap = <T extends Event>(
            target: EventTarget,
            name: string,
            fn: (event: T) => void,
            options?: AddEventListenerOptions
        ) => {
            const callback = (event: Event) => {
                camera.scene.events.fire('camera.controller', name);
                fn(event as T);
            };
            target.addEventListener(name, callback, options);
            destroy = () => {
                destroy?.();
                target.removeEventListener(name, callback);
            };
        };

        wrap(target, 'pointerdown', pointerdown);
        wrap(target, 'pointerup', pointerup);
        // a cancelled touch gets no pointerup; without this its entry stays in
        // `touches` and later gestures are misread
        wrap(target, 'pointercancel', pointerup);
        wrap(target, 'pointermove', pointermove);
        wrap(target, 'wheel', wheel, { passive: false });
        wrap(target, 'dblclick', dblclick);
        wrap(window, 'blur', clearAllKeys);

        // Registered directly (not via wrap) so physical-Ctrl tracking
        // doesn't fire camera.controller on every keystroke. Capture phase
        // ensures we see Ctrl keydown/keyup even when a focused UI element
        // (dialogs, popups) calls stopPropagation() on key events - otherwise
        // ctrlDown could go stale and a real Ctrl+wheel would be misread as a
        // synthetic-Ctrl pinch.
        window.addEventListener('keydown', keydown, { capture: true });
        window.addEventListener('keyup', keyup, { capture: true });

        this.destroy = () => {
            destroy?.();
            window.removeEventListener('keydown', keydown, { capture: true });
            window.removeEventListener('keyup', keyup, { capture: true });
            events.off('camera.controlMode', onControlMode);
            events.off('camera.move.forward', onMoveForward);
            events.off('camera.move.backward', onMoveBackward);
            events.off('camera.move.left', onMoveLeft);
            events.off('camera.move.right', onMoveRight);
            events.off('camera.move.down', onMoveDown);
            events.off('camera.move.up', onMoveUp);
            freeLookHandlers.forEach(({ name, handler }) => events.off(name, handler));
            events.off('camera.modifier.fast', onModifierFast);
            events.off('camera.modifier.slow', onModifierSlow);
        };
    }
}

export { PointerController };
