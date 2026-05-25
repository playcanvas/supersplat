import { Vec3 } from 'playcanvas';

import type { Collision } from '../collision';
import type { CameraFrame, Camera, CameraController } from './camera';
import { DEFAULT_CONTROLLER_DAMPING, applyFrameRotation, dampAngles, setBasisOffset, setCameraBasis } from './camera-utils';
import { SphereMover } from './sphere-mover';

/** Radius of the camera collision sphere (meters) */
const CAMERA_RADIUS = 0.2;

const forward = new Vec3();
const right = new Vec3();
const up = new Vec3();
const offset = new Vec3();

class FlyController implements CameraController {
    fov = 90;

    rotateDamping = DEFAULT_CONTROLLER_DAMPING;

    private _position = new Vec3();

    private _angles = new Vec3();

    private _targetAngles = new Vec3();

    private _distance = 1;

    private _spawnPosition = new Vec3();

    private _spawnAngles = new Vec3();

    private _spawnDistance = 1;

    private _mover = new SphereMover(CAMERA_RADIUS);

    /** Optional collision for sphere collision with sliding */
    set collision(value: Collision | null) {
        this._mover.collision = value;
        this._mover.reset(this._position);
    }

    get collision(): Collision | null {
        return this._mover.collision;
    }

    private _hasSpawn = false;

    onEnter(camera: Camera): void {
        this.goto(camera);
        this._mover.resolve(this._position);
        this._storeSpawn();
    }

    update(deltaTime: number, inputFrame: CameraFrame, camera: Camera) {
        const { move, rotate } = inputFrame.read();

        applyFrameRotation(this._targetAngles, rotate);
        dampAngles(this._angles, this._targetAngles, this.rotateDamping, deltaTime);

        this._step(move);

        camera.position.copy(this._position);
        camera.angles.set(this._angles.x, this._angles.y, 0);
        camera.distance = this._distance;
        camera.fov = this.fov;
    }

    onExit(_camera: Camera): void {

    }

    goto(camera: Camera) {
        this._position.copy(camera.position);
        this._angles.set(camera.angles.x, camera.angles.y, 0);
        this._targetAngles.copy(this._angles);
        this._distance = camera.distance;
        this._mover.reset(this._position);
    }

    resetToSpawn(camera: Camera): boolean {
        if (!this._hasSpawn) {
            return false;
        }

        this._position.copy(this._spawnPosition);
        this._angles.copy(this._spawnAngles);
        this._targetAngles.copy(this._spawnAngles);
        this._distance = this._spawnDistance;
        this._mover.reset(this._position);

        camera.position.copy(this._position);
        camera.angles.copy(this._angles);
        camera.distance = this._distance;
        camera.fov = this.fov;

        return true;
    }

    private _storeSpawn() {
        this._spawnPosition.copy(this._position);
        this._spawnAngles.copy(this._angles);
        this._spawnDistance = this._distance;
        this._hasSpawn = true;
    }

    private _step(move: number[]) {
        setCameraBasis(this._angles, forward, right, up);

        setBasisOffset(offset, move[0], move[1], move[2], forward, right, up);
        this._mover.move(this._position, offset);
    }
}

export { FlyController };
