import type { CameraManager } from '../camera-manager';
import type { State } from '../types';

type CameraStateSnapshot = {
    position: [number, number, number];
    angles: [number, number, number];
    distance: number;
    fov: number;
    mode: 'orbit' | 'anim' | 'fly' | 'walk';
};

const captureCameraState = (cm: CameraManager, state: State): CameraStateSnapshot => ({
    position: [cm.camera.position.x, cm.camera.position.y, cm.camera.position.z],
    angles: [cm.camera.angles.x, cm.camera.angles.y, cm.camera.angles.z],
    distance: cm.camera.distance,
    fov: cm.camera.fov,
    mode: state.cameraMode
});

const restoreCameraState = (cm: CameraManager, state: State, snapshot: CameraStateSnapshot) => {
    cm.camera.position.set(snapshot.position[0], snapshot.position[1], snapshot.position[2]);
    cm.camera.angles.set(snapshot.angles[0], snapshot.angles[1], snapshot.angles[2]);
    cm.camera.distance = snapshot.distance;
    cm.camera.fov = snapshot.fov;
    // Mode change (if any) fires cameraMode:changed which runs the new
    // controller's onEnter against our just-set pose; snap() then cancels
    // the resulting transition lerp. Same-mode case: snap() re-seeds the
    // active controller in place.
    if (state.cameraMode !== snapshot.mode) {
        state.cameraMode = snapshot.mode;
    }
    cm.snap();
};

export { captureCameraState, restoreCameraState };
export type { CameraStateSnapshot };
