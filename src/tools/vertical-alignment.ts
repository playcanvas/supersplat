import { Quat, Vec3 } from 'playcanvas';

import { Transform } from '../transform';

// Align a picked local-space line with world +Y (or -Y when flipped). Solve
// from the same baseline for both flip states so flipping twice cannot drift.
const alignVertical = (baseline: Transform, pivot: Vec3, top: Vec3, bottom: Vec3, flipped = false): Transform | null => {
    const values = [baseline.position, baseline.scale, pivot, top, bottom];
    if (values.some(v => ![v.x, v.y, v.z].every(Number.isFinite)) ||
        ![baseline.rotation.x, baseline.rotation.y, baseline.rotation.z, baseline.rotation.w].every(Number.isFinite)) {
        return null;
    }

    const line = new Vec3().sub2(top, bottom).mul(baseline.scale);
    if (line.lengthSq() < 1e-16) {
        return null;
    }

    const axis = baseline.rotation.transformVector(line.normalize());
    const tilt = new Quat().setFromDirections(axis, flipped ? Vec3.DOWN : Vec3.UP);
    const rotation = new Quat().mul2(tilt, baseline.rotation).normalize();

    // Preserve the model's horizontal heading, rather than its Euler Y angle.
    // Fall back to another axis when +Z projects too close to a vertical pole.
    for (const reference of [Vec3.BACK, Vec3.RIGHT, Vec3.UP]) {
        const before = baseline.rotation.transformVector(reference);
        const after = rotation.transformVector(reference);
        if (Math.hypot(before.x, before.z) < 1e-4 || Math.hypot(after.x, after.z) < 1e-4) {
            continue;
        }
        const yaw = (Math.atan2(before.x, before.z) - Math.atan2(after.x, after.z)) * 180 / Math.PI;
        rotation.mul2(new Quat().setFromAxisAngle(Vec3.UP, yaw), rotation).normalize();
        break;
    }

    const delta = new Quat().mul2(rotation, baseline.rotation.clone().invert()).normalize();
    const position = delta.transformVector(baseline.position.clone().sub(pivot)).add(pivot);
    return new Transform(position, rotation, baseline.scale);
};

export { alignVertical };
