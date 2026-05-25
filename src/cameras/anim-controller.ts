import type { Camera, CameraFrame } from './camera';
import { CameraController } from './camera';
import { drainInputFrame } from './camera-utils';
import { AnimState } from '../animation/anim-state';
import { AnimTrack } from '../settings';

class AnimController implements CameraController {
    animState: AnimState;

    constructor(animTrack: AnimTrack) {
        this.animState = AnimState.fromTrack(animTrack);
        this.animState.update(0);
    }

    onEnter(camera: Camera): void {
        camera.look(this.animState.position, this.animState.target);
        camera.fov = this.animState.fov;
    }

    update(deltaTime: number, inputFrame: CameraFrame, camera: Camera) {
        this.animState.update(deltaTime);

        camera.look(this.animState.position, this.animState.target);
        camera.fov = this.animState.fov;

        drainInputFrame(inputFrame);
    }

    onExit(camera: Camera): void {

    }
}

export { AnimController };
