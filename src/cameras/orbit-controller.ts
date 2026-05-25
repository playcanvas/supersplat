import {
    OrbitController as OrbitControllerPC,
    Pose,
    Vec2
} from 'playcanvas';

import type { Camera, CameraFrame, CameraController } from './camera';
import { DEFAULT_CONTROLLER_DAMPING } from './camera-utils';

const p = new Pose();

class OrbitController implements CameraController {
    controller: OrbitControllerPC;

    fov = 90;

    constructor() {
        this.controller = new OrbitControllerPC();
        this.controller.zoomRange = new Vec2(0.01, Infinity);
        this.controller.pitchRange = new Vec2(-90, 90);
        this.controller.rotateDamping = DEFAULT_CONTROLLER_DAMPING;
        this.controller.moveDamping = DEFAULT_CONTROLLER_DAMPING;
        this.controller.zoomDamping = DEFAULT_CONTROLLER_DAMPING;
    }

    onEnter(camera: Camera): void {
        this._attach(camera);
    }

    update(deltaTime: number, inputFrame: CameraFrame, camera: Camera) {
        const pose = this.controller.update(inputFrame, deltaTime);

        camera.position.copy(pose.position);
        camera.angles.copy(pose.angles);
        camera.distance = pose.distance;
        camera.fov = this.fov;
    }

    onExit(_camera: Camera): void {

    }

    goto(camera: Camera) {
        this.fov = camera.fov;
        this._attach(camera);
    }

    private _attach(camera: Camera) {
        p.position.copy(camera.position);
        p.angles.copy(camera.angles);
        p.distance = Math.max(camera.distance, this.controller.zoomRange.x);
        this.controller.attach(p, false);
    }
}

export { OrbitController };
