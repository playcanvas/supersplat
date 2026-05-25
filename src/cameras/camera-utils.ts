import { math, Quat, Vec3 } from 'playcanvas';

import type { CameraFrame } from './camera';
import { damp, mod } from '../core/math';

/**
 * Shared damping factor for controller smoothing (rotate / move / zoom) so
 * orbit, fly, and walk feel the same. Used as `damp(damping, dt)` →
 * `1 - damping^(dt*1000)`. Higher means smoother / more lag. Not used for
 * physics-style velocity decay (e.g. walk's grounded/air velocity damping),
 * which has different tuning needs.
 */
const DEFAULT_CONTROLLER_DAMPING = 0.96;

const rotation = new Quat();

/**
 * Apply a CameraFrame rotate delta to camera Euler angles.
 *
 * CameraFrame rotate uses [yaw, pitch, roll]-style input deltas, while camera
 * angles are stored as [pitch, yaw, roll].
 *
 * @param angles - Camera Euler angles to mutate.
 * @param rotate - Frame rotate delta.
 * @param minPitch - Minimum pitch angle in degrees.
 * @param maxPitch - Maximum pitch angle in degrees.
 * @returns The mutated angles.
 */
const applyFrameRotation = (
    angles: Vec3,
    rotate: readonly number[],
    minPitch = -90,
    maxPitch = 90
) => {
    angles.x -= rotate[1];
    angles.y -= rotate[0];
    angles.z = 0;
    angles.x = math.clamp(angles.x, minPitch, maxPitch);
    return angles;
};

/**
 * Calculate camera-relative basis vectors from Euler angles.
 *
 * @param angles - Camera Euler angles in degrees.
 * @param forward - Receives the forward vector.
 * @param right - Receives the right vector.
 * @param up - Receives the up vector.
 */
const setCameraBasis = (angles: Vec3, forward: Vec3, right: Vec3, up: Vec3) => {
    rotation.setFromEulerAngles(angles);
    rotation.transformVector(Vec3.FORWARD, forward);
    rotation.transformVector(Vec3.RIGHT, right);
    rotation.transformVector(Vec3.UP, up);
};

/**
 * Calculate a camera forward vector from Euler angles.
 *
 * @param angles - Camera Euler angles in degrees.
 * @param forward - Receives the forward vector.
 */
const setCameraForward = (angles: Vec3, forward: Vec3) => {
    rotation.setFromEulerAngles(angles);
    rotation.transformVector(Vec3.FORWARD, forward);
};

/**
 * Calculate yaw-only movement basis vectors.
 *
 * @param yaw - Camera yaw angle in degrees.
 * @param forward - Receives the horizontal forward vector.
 * @param right - Receives the horizontal right vector.
 */
const setYawBasis = (yaw: number, forward: Vec3, right: Vec3) => {
    rotation.setFromEulerAngles(0, yaw, 0);
    rotation.transformVector(Vec3.FORWARD, forward);
    rotation.transformVector(Vec3.RIGHT, right);
};

/**
 * Build a world-space offset from local movement along camera basis vectors.
 *
 * @param out - Receives the world-space offset.
 * @param x - Local right movement.
 * @param y - Local up movement.
 * @param z - Local forward movement.
 * @param forward - Forward basis vector.
 * @param right - Right basis vector.
 * @param up - Up basis vector.
 * @returns The mutated output vector.
 */
const setBasisOffset = (
    out: Vec3,
    x: number,
    y: number,
    z: number,
    forward: Vec3,
    right: Vec3,
    up: Vec3
) => {
    out.set(
        right.x * x + up.x * y + forward.x * z,
        right.y * x + up.y * y + forward.y * z,
        right.z * x + up.z * y + forward.z * z
    );
    return out;
};

/**
 * Lerp Euler angles toward a target using frame-rate-independent shortest-path
 * interpolation. Yaw/roll on both `angles` and `target` are wrapped into
 * `[0, 360)` so `lerpAngle`'s single-shift shortest-path stays valid after
 * many full rotations (otherwise the camera takes the long way around). Pitch
 * is left untouched since callers clamp it.
 *
 * @param angles - Current angles, mutated toward target.
 * @param target - Target angles. Yaw/roll are wrapped in place to keep
 * accumulated drift bounded across frames.
 * @param damping - Damping factor in [0, 1]. Higher = smoother (1 = never moves).
 * @param dt - Delta time in seconds.
 * @returns The mutated angles.
 */
const dampAngles = (angles: Vec3, target: Vec3, damping: number, dt: number) => {
    if (dt <= 0) {
        return angles;
    }
    const t = damp(damping, dt);
    angles.y = mod(angles.y, 360);
    angles.z = mod(angles.z, 360);
    target.y = mod(target.y, 360);
    target.z = mod(target.z, 360);
    angles.x = math.lerpAngle(angles.x, target.x, t);
    angles.y = math.lerpAngle(angles.y, target.y, t);
    angles.z = math.lerpAngle(angles.z, target.z, t);
    return angles;
};

/**
 * Discard any pending input deltas in the frame. `InputFrame.read()` zeros
 * deltas as a side-effect of reading, so calling this prevents accumulated
 * input from leaking into the next controller when a non-input-driven mode
 * (e.g. animation) is active.
 *
 * @param frame - The camera frame whose deltas should be drained.
 */
const drainInputFrame = (frame: CameraFrame) => {
    frame.read();
};

export {
    DEFAULT_CONTROLLER_DAMPING,
    applyFrameRotation,
    dampAngles,
    drainInputFrame,
    setBasisOffset,
    setCameraBasis,
    setCameraForward,
    setYawBasis
};
