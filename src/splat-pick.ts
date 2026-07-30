import { Mat4, Ray, Vec3, Vec4 } from 'playcanvas';

import { sigmoid } from './color-grade';
import { Scene } from './scene';
import { Splat } from './splat';
import { State } from './splat-state';

// clicked points gather the gaussians whose centers project within this many
// pixels of the cursor (falling back to the larger radius on sparse surfaces)
const PICK_RADIUS = 8;
const PICK_RADIUS_FAR = 24;

// Pick the visible surface point of a splat under a screen position, writing
// the splat-local result. The point lies on the click ray (under the cursor)
// at the median visible depth of the gaussians whose centers project near the
// click. A single pick is unreliable on real captures: the frontmost gaussian
// is often a large, nearly transparent floater (placing the point in mid-air),
// while the depth pick's transmittance-weighted mean lands behind the surface.
// Compositing the candidates front to back like the renderer keeps the point
// on the dominant visible surface.
const pickSplatSurfacePoint = async (scene: Scene, splat: Splat, offsetX: number, offsetY: number, result: Vec3) => {
    const { source, sourcePool } = splat.resource;
    // this sweep walks source chunks in file order (sequential reads), so it
    // indexes the instance arrays by row - valid while the list is the identity
    const { instances } = splat;
    const state = instances.flags;
    const localToClip = new Mat4();
    const paletteTransform = new Mat4();
    const ray = new Ray();
    const projected = new Vec4();
    const center = new Vec3();

    const cw = scene.canvas.clientWidth;
    const ch = scene.canvas.clientHeight;

    localToClip.mul2(scene.camera.camera.projectionMatrix, scene.camera.camera.viewMatrix);
    localToClip.mul(splat.worldTransform);
    scene.camera.getRay(offsetX, offsetY, ray);

    const near: { t: number, w: number }[] = [];
    const far: { t: number, w: number }[] = [];

    for (let chunkIndex = 0; chunkIndex < source.meta.numChunks[0]; ++chunkIndex) {
        const count = Math.min(source.meta.chunkSize, source.meta.numGaussians - chunkIndex * source.meta.chunkSize);
        const position = sourcePool.acquire('position', source.meta.layouts.position, count);
        const geometric = sourcePool.acquire('geometric', source.meta.layouts.geometric, count);
        try {
            await source.read({ chunkIndex, position, geometric });
            const positions = new Float32Array(position.data);
            const geometry = new Float32Array(geometric.data);
            const base = chunkIndex * source.meta.chunkSize;

            for (let i = 0; i < count; ++i) {
                const index = base + i;
                if (state[index] & State.deleted) {
                    continue;
                }

                center.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
                const paletteIndex = instances.transformIndex(index);
                if (paletteIndex) {
                    splat.transformPalette.getTransform(paletteIndex, paletteTransform);
                    paletteTransform.transformPoint(center, center);
                }

                projected.set(center.x, center.y, center.z, 1);
                localToClip.transformVec4(projected, projected);
                if (projected.w <= 0) {
                    continue;
                }

                const dx = Math.abs((projected.x / projected.w * 0.5 + 0.5) * cw - offsetX);
                const dy = Math.abs((-projected.y / projected.w * 0.5 + 0.5) * ch - offsetY);
                if (dx >= PICK_RADIUS_FAR || dy >= PICK_RADIUS_FAR) {
                    continue;
                }

                // depth along the click ray. the inverted test also rejects NaN
                // (e.g. a degenerate zero-sized viewport makes getRay produce NaN),
                // which would otherwise flow through every comparison unchecked
                splat.worldTransform.transformPoint(center, center);
                const dist = center.sub(ray.origin).dot(ray.direction);
                if (!(dist > 0)) {
                    continue;
                }

                const entry = { t: dist, w: sigmoid(geometry[i * 8 + 7]) };
                far.push(entry);
                if (dx < PICK_RADIUS && dy < PICK_RADIUS) {
                    near.push(entry);
                }
            }
        } finally {
            position.release();
            geometric.release();
        }
    }

    const candidates = near.length > 0 ? near : far;
    if (candidates.length === 0) {
        return false;
    }

    // composite the candidates front to back like the renderer would: each
    // contributes its opacity scaled by the remaining transmittance, so an
    // opaque surface in front wins even when denser geometry sits behind it
    // (a raw census would vote for the occluded geometry)
    candidates.sort((a, b) => a.t - b.t);
    let transmittance = 1;
    let total = 0;
    for (const cand of candidates) {
        const alpha = cand.w;
        cand.w = alpha * transmittance;
        total += cand.w;
        transmittance *= 1 - Math.min(0.99, alpha);
        if (transmittance < 0.05) {
            break;
        }
    }

    // the point lands at the median visible depth
    let accum = 0;
    let median = candidates[candidates.length - 1].t;
    for (const cand of candidates) {
        accum += cand.w;
        if (accum >= total * 0.5) {
            median = cand.t;
            break;
        }
    }

    center.copy(ray.direction).mulScalar(median).add(ray.origin);
    localToClip.invert(splat.worldTransform);
    localToClip.transformPoint(center, result);

    return true;
};

export { pickSplatSurfacePoint };
