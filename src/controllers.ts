import {Camera} from './camera';
import {
    EVENT_MOUSEDOWN,
    EVENT_MOUSEUP,
    EVENT_MOUSEMOVE,
    EVENT_MOUSEWHEEL,
    MOUSEBUTTON_LEFT,
    MOUSEBUTTON_MIDDLE,
    MOUSEBUTTON_RIGHT,
    EVENT_TOUCHSTART,
    EVENT_TOUCHEND,
    EVENT_TOUCHCANCEL,
    EVENT_TOUCHMOVE,
    MouseEvent,
    Plane,
    Ray,
    Touch,
    TouchDevice,
    TouchEvent,
    Vec2,
    Vec3,
} from 'playcanvas';

const plane = new Plane();
const ray = new Ray();
const vec = new Vec3();
const fromWorldPoint = new Vec3();
const toWorldPoint = new Vec3();
const worldDiff = new Vec3();

// MouseController

class MouseController {
    camera: Camera;
    leftButton = false;
    middleButton = false;
    rightButton = false;
    lastPoint = new Vec2();

    enableOrbit = true;
    enablePan = true;
    enableZoom = true;
    zoomedIn = 1;
    xMouse = 0;
    yMouse = 0;

    onMouseOutFunc = () => {
        this.onMouseOut();
    };

    onDblClick = (event: MouseEvent) => {
        // @ts-ignore
        const target = this.camera.scene.app.mouse._target;
        const sx = event.offsetX / target.clientWidth * this.camera.scene.targetSize.width;
        const sy = event.offsetY / target.clientHeight * this.camera.scene.targetSize.height;

        this.camera.pickPrep(this.camera.scene.events.invoke('camera.mode') === 'rings' ? 0.0 : 0.2);
        const pickId = this.camera.pick(sx, sy);

        if (pickId !== -1) {
            const splatPos = this.camera.scene.events.invoke('splat.getWorldPosition', pickId);

            // create a plane at the world position facing perpendicular to the camera
            plane.setFromPointNormal(splatPos, this.camera.entity.forward);

            // create the pick ray in world space
            const cameraPos = this.camera.entity.getPosition();
            const res = this.camera.entity.camera.screenToWorld(event.offsetX, event.offsetY, 1.0, vec);
            vec.sub2(res, cameraPos);
            vec.normalize();
            ray.set(cameraPos, vec);

            // find intersection
            if (plane.intersectsRay(ray, vec)) {
                this.camera.setFocalPoint(vec);
            }
        }
    };

    constructor(camera: Camera) {
        this.camera = camera;
        const mouse = camera.scene.app.mouse;
        mouse.on(EVENT_MOUSEDOWN, this.onMouseDown, this);
        mouse.on(EVENT_MOUSEUP, this.onMouseUp, this);
        mouse.on(EVENT_MOUSEMOVE, this.onMouseMove, this);
        mouse.on(EVENT_MOUSEWHEEL, this.onMouseWheel, this);

        // Listen to when the mouse travels out of the window
        // window.addEventListener('mouseout', this.onMouseOutFunc, false);

        // @ts-ignore
        mouse._target.addEventListener('dblclick', this.onDblClick.bind(this));

        // Disabling the context menu stops the browser displaying a menu when
        // you right-click the page
        mouse.disableContextMenu();
    }

    destroy() {
        const mouse = this.camera.scene.app.mouse;
        mouse.off(EVENT_MOUSEDOWN, this.onMouseDown, this);
        mouse.off(EVENT_MOUSEUP, this.onMouseUp, this);
        mouse.off(EVENT_MOUSEMOVE, this.onMouseMove, this);
        mouse.off(EVENT_MOUSEWHEEL, this.onMouseWheel, this);

        // window.removeEventListener('mouseout', this.onMouseOutFunc, false);

        // @ts-ignore
        mouse._target.removeEventListener('dblclick', this.onDblClick);
    }

    orbit(dx: number, dy: number) {
        if (!this.enableOrbit) {
            return;
        }
        const azim = this.camera.azim - dx * this.camera.scene.config.controls.orbitSensitivity;
        const elev = this.camera.elevation - dy * this.camera.scene.config.controls.orbitSensitivity;
        this.camera.setAzimElev(azim, elev);
    }

    pan(x: number, y: number) {
        if (!this.enablePan) {
            return;
        }
        // For panning to work at any zoom level, we use screen point to world projection
        // to work out how far we need to pan the pivotEntity in world space
        const camera = this.camera.entity.camera;
        const distance = this.camera.focusDistance * this.camera.distanceTween.value.distance;

        camera.screenToWorld(x, y, distance, fromWorldPoint);
        camera.screenToWorld(this.lastPoint.x, this.lastPoint.y, distance, toWorldPoint);

        worldDiff.sub2(toWorldPoint, fromWorldPoint);
        worldDiff.add(this.camera.focalPoint);

        this.camera.setFocalPoint(worldDiff);
    }

    zoom(amount: number) {
        if (!this.enableZoom) {
            return;
        }
        this.camera.setDistance(this.camera.distance * (1 - amount), 2);
    }

    hasDragged(event: MouseEvent): boolean {
        return this.xMouse !== event.x || this.yMouse !== event.y;
    }

    onMouseDown(event: MouseEvent) {
        this.xMouse = event.x;
        this.yMouse = event.y;
        switch (event.button) {
            case MOUSEBUTTON_LEFT:
                this.leftButton = true;
                this.camera.notify('mouseStart');
                break;
            case MOUSEBUTTON_MIDDLE:
                this.middleButton = true;
                this.camera.notify('mouseStart');
                break;
            case MOUSEBUTTON_RIGHT:
                this.rightButton = true;
                this.camera.notify('mouseStart');
                break;
        }
    }

    onMouseUp(event: MouseEvent) {
        switch (event.button) {
            case MOUSEBUTTON_LEFT:
                this.leftButton = false;
                this.camera.notify('mouseEnd');
                break;
            case MOUSEBUTTON_MIDDLE:
                this.middleButton = false;
                this.camera.notify('mouseEnd');
                break;
            case MOUSEBUTTON_RIGHT:
                this.rightButton = false;
                this.camera.notify('mouseEnd');
                break;
        }

        if (this.hasDragged(event)) {
            this.xMouse = event.x;
            this.yMouse = event.y;
        }
    }

    onMouseMove(event: MouseEvent) {
        if (this.leftButton) {
            if (event.ctrlKey) {
                this.zoom(event.dx * -0.02);
            } else if (event.shiftKey) {
                this.pan(event.x, event.y);
            } else {
                this.orbit(event.dx, event.dy);
            }
        } else if (this.rightButton) {
            this.pan(event.x, event.y);
        } else if (this.middleButton) {
            this.zoom(event.dx * -0.02);
        }

        this.lastPoint.set(event.x, event.y);
    }

    onMouseWheel(event: MouseEvent) {
        this.zoom(event.wheelDelta * -0.2 * this.camera.scene.config.controls.zoomSensitivity);
        this.camera.notify('mouseZoom');
        event.event.preventDefault();
        if (event.wheelDelta !== this.zoomedIn) {
            this.zoomedIn = event.wheelDelta;
        }
    }

    onMouseOut() {
        this.leftButton = this.middleButton = this.rightButton = false;
    }
}

// TouchController

class TouchController {
    touch: TouchDevice;
    camera: Camera;
    lastTouchPoint = new Vec2();
    lastPinchMidPoint = new Vec2();
    lastPinchDistance = 0;
    pinchMidPoint = new Vec2();

    enableOrbit = true;
    enablePan = true;
    enableZoom = true;
    xTouch: number;
    yTouch: number;

    constructor(camera: Camera) {
        this.camera = camera;
        this.xTouch = 0;
        this.yTouch = 0;
        // Use the same callback for the touchStart, touchEnd and touchCancel events as they
        // all do the same thing which is to deal the possible multiple touches to the screen
        const touch = this.camera.scene.app.touch;
        touch.on(EVENT_TOUCHSTART, this.onTouchStartEndCancel, this);
        touch.on(EVENT_TOUCHEND, this.onTouchStartEndCancel, this);
        touch.on(EVENT_TOUCHCANCEL, this.onTouchStartEndCancel, this);
        touch.on(EVENT_TOUCHMOVE, this.onTouchMove, this);
    }

    destroy() {
        const touch = this.camera.scene.app.touch;
        touch.off(EVENT_TOUCHSTART, this.onTouchStartEndCancel, this);
        touch.off(EVENT_TOUCHEND, this.onTouchStartEndCancel, this);
        touch.off(EVENT_TOUCHCANCEL, this.onTouchStartEndCancel, this);
        touch.off(EVENT_TOUCHMOVE, this.onTouchMove, this);
    }

    getPinchDistance(pointA: Touch, pointB: Touch) {
        // Return the distance between the two points
        const dx = pointA.x - pointB.x;
        const dy = pointA.y - pointB.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    calcMidPoint(pointA: Touch, pointB: Touch, result: Vec2) {
        result.set(pointB.x - pointA.x, pointB.y - pointA.y);
        result.mulScalar(0.5);
        result.x += pointA.x;
        result.y += pointA.y;
    }

    onTouchStartEndCancel(event: TouchEvent) {
        // We only care about the first touch for camera rotation. As the user touches the screen,
        // we stored the current touch position
        const touches = event.touches;
        if (touches.length === 1) {
            this.lastTouchPoint.set(touches[0].x, touches[0].y);
            this.camera.notify('touchStart');
            this.xTouch = touches[0].x;
            this.yTouch = touches[0].y;
        } else if (touches.length === 2) {
            // If there are 2 touches on the screen, then set the pinch distance
            this.lastPinchDistance = this.getPinchDistance(touches[0], touches[1]);
            this.calcMidPoint(touches[0], touches[1], this.lastPinchMidPoint);
            this.camera.notify('touchStart');
        } else {
            this.camera.notify('touchEnd');
        }
    }

    pan(midPoint: Vec2) {
        if (!this.enablePan) {
            return;
        }

        // For panning to work at any zoom level, we use screen point to world projection
        // to work out how far we need to pan the pivotEntity in world space
        const camera = this.camera.entity.camera;
        const distance = this.camera.distance;

        camera.screenToWorld(midPoint.x, midPoint.y, distance, fromWorldPoint);
        camera.screenToWorld(this.lastPinchMidPoint.x, this.lastPinchMidPoint.y, distance, toWorldPoint);

        worldDiff.sub2(toWorldPoint, fromWorldPoint);
        worldDiff.add(this.camera.focalPoint);

        this.camera.setFocalPoint(worldDiff);
    }

    onTouchMove(event: TouchEvent) {
        const pinchMidPoint = this.pinchMidPoint;

        // We only care about the first touch for camera rotation. Work out the difference moved since the last event
        // and use that to update the camera target position
        const touches = event.touches;
        if (touches.length === 1 && this.enableOrbit) {
            const touch = touches[0];
            const elev =
                this.camera.elevation -
                (touch.y - this.lastTouchPoint.y) * this.camera.scene.config.controls.orbitSensitivity;
            const azim =
                this.camera.azim -
                (touch.x - this.lastTouchPoint.x) * this.camera.scene.config.controls.orbitSensitivity;
            this.camera.setAzimElev(azim, elev);
            this.lastTouchPoint.set(touch.x, touch.y);
        } else if (touches.length === 2 && this.enableZoom) {
            // Calculate the difference in pinch distance since the last event
            const currentPinchDistance = this.getPinchDistance(touches[0], touches[1]);
            const diffInPinchDistance = currentPinchDistance - this.lastPinchDistance;
            this.lastPinchDistance = currentPinchDistance;

            const distance =
                this.camera.distance -
                diffInPinchDistance *
                    this.camera.scene.config.controls.zoomSensitivity *
                    0.1 *
                    (this.camera.distance * 0.1);
            this.camera.setDistance(distance);

            // Calculate pan difference
            this.calcMidPoint(touches[0], touches[1], pinchMidPoint);
            this.pan(pinchMidPoint);
            this.lastPinchMidPoint.copy(pinchMidPoint);
        }
    }
}

export {MouseController, TouchController};
