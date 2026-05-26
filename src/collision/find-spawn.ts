import type { Collision } from './collision';

/** Maximum Euclidean distance (metres) from the spawn origin to search for a valid placement. */
const SEARCH_RADIUS = 5;
const SEARCH_RADIUS_SQ = SEARCH_RADIUS * SEARCH_RADIUS;

/** Ray budget when probing for ground/ceiling under or above a candidate column. */
const RAY_MAX_DIST = 1000;

interface SpawnOut {
    x: number;
    y: number;
    z: number;
}

// Scratch values reused across calls — these helpers run only at spawn time
// so the lack of re-entrancy is fine.
const scratchPush = { x: 0, y: 0, z: 0 };

/**
 * Find the closest sphere placement to (ox, oy, oz) where a sphere of `radius`
 * fits clear of geometry. Output is the sphere centre. Used for fly-camera
 * spawn — fly cameras have no ground constraint.
 *
 * Lattice search across voxel-spaced offsets from the origin (step =
 * `collision.voxelResolution`), ordered by Chebyshev shell with Euclidean
 * tie-break within a shell. Search bounded by `SEARCH_RADIUS`.
 *
 * @param collision - Active collision implementation.
 * @param ox - Origin X (world space).
 * @param oy - Origin Y (world space).
 * @param oz - Origin Z (world space).
 * @param radius - Sphere radius.
 * @param out - Receives the sphere centre on success.
 * @returns True if a valid placement was found.
 */
const findSphereSpawn = (
    collision: Collision,
    ox: number, oy: number, oz: number,
    radius: number,
    out: SpawnOut
): boolean => {
    const step = collision.voxelResolution;
    const maxCells = Math.ceil(SEARCH_RADIUS / step);

    let bestDistSq = Infinity;
    let found = false;

    for (let r = 0; r <= maxCells; r++) {
        const shellMinDistSq = (r * step) * (r * step);
        if (shellMinDistSq >= bestDistSq) break;

        for (let dy = -r; dy <= r; dy++) {
            const absDy = dy < 0 ? -dy : dy;
            for (let dz = -r; dz <= r; dz++) {
                const absDz = dz < 0 ? -dz : dz;
                for (let dx = -r; dx <= r; dx++) {
                    const absDx = dx < 0 ? -dx : dx;
                    // Only cells on the Chebyshev shell of radius r.
                    if (absDx < r && absDy < r && absDz < r) continue;

                    const distSq = (dx * dx + dy * dy + dz * dz) * step * step;
                    if (distSq >= bestDistSq || distSq > SEARCH_RADIUS_SQ) continue;

                    const cx = ox + dx * step;
                    const cy = oy + dy * step;
                    const cz = oz + dz * step;

                    if (collision.querySphere(cx, cy, cz, radius, scratchPush)) continue;

                    bestDistSq = distSq;
                    out.x = cx;
                    out.y = cy;
                    out.z = cz;
                    found = true;
                }
            }
        }
    }

    return found;
};

/**
 * Find the closest standable cylinder placement to (ox, oy, oz). Output is the
 * floor world position the cylinder rests on (highest geometry hit across the
 * footprint). Used for walk-camera spawn.
 *
 * The algorithm:
 *
 * 1. Lattice search for the closest free voxel `C` (per `isFreeAt`) that has
 *    geometry somewhere below — i.e. a downward ray from `C` hits.
 * 2. At `(C.x, C.z)`, fan rays up and down from `C.y` through every cell
 *    (step = `collision.voxelResolution`) within the xz footprint disc.
 *    Compute, across columns:
 *      - `floor = max(yDown_i)`         (highest ground in the footprint)
 *      - `ceiling = min(yUp_i)`         (lowest obstruction overhead, or ∞)
 *    Every column must have a `yDown` hit; otherwise the cylinder is partly
 *    unsupported and the candidate is discarded.
 * 3. The cylinder fits iff `floor + halfHeight ≤ ceiling - halfHeight`,
 *    i.e. enough vertical clearance for the full cylinder above the floor.
 *    The "resting on ground" placement has centre at `floor + halfHeight`.
 *
 * Cylinder math (flat ends, no hemispheres) intentionally matches the carve,
 * which used a separable XYZ dilation.
 *
 * @param collision - Active collision implementation.
 * @param ox - Origin X (world space).
 * @param oy - Origin Y (world space).
 * @param oz - Origin Z (world space).
 * @param halfHeight - Cylinder half-height (full height = 2 × halfHeight).
 * @param radius - Cylinder radius.
 * @param out - Receives the floor position the cylinder rests on.
 * @returns True if a valid placement was found.
 */
const findCylinderSpawn = (
    collision: Collision,
    ox: number, oy: number, oz: number,
    halfHeight: number,
    radius: number,
    out: SpawnOut
): boolean => {
    const step = collision.voxelResolution;
    const maxCells = Math.ceil(SEARCH_RADIUS / step);
    // Round up so float division (e.g. 0.2 / 0.05) can't accidentally drop
    // the outer ring of footprint cells; the Euclidean check below trims any
    // overshoot back to the true radius.
    const footCells = Math.ceil(radius / step);
    const radiusSq = radius * radius;

    let bestDistSq = Infinity;
    let found = false;

    for (let r = 0; r <= maxCells; r++) {
        const shellMinDistSq = (r * step) * (r * step);
        if (shellMinDistSq >= bestDistSq) break;

        for (let dy = -r; dy <= r; dy++) {
            const absDy = dy < 0 ? -dy : dy;
            for (let dz = -r; dz <= r; dz++) {
                const absDz = dz < 0 ? -dz : dz;
                for (let dx = -r; dx <= r; dx++) {
                    const absDx = dx < 0 ? -dx : dx;
                    if (absDx < r && absDy < r && absDz < r) continue;

                    const distSq = (dx * dx + dy * dy + dz * dz) * step * step;
                    if (distSq >= bestDistSq || distSq > SEARCH_RADIUS_SQ) continue;

                    const cx = ox + dx * step;
                    const cy = oy + dy * step;
                    const cz = oz + dz * step;

                    // Stage 1: cheap filter — only consider free voxels.
                    // The footprint loop below will reject candidates whose
                    // center column has no ground support, so no separate
                    // down-ray probe is needed here.
                    if (!collision.isFreeAt(cx, cy, cz)) continue;

                    // Stage 2/3: fan rays through the xz footprint.
                    let floor = -Infinity;
                    let ceiling = Infinity;
                    let supported = true;

                    for (let i = -footCells; i <= footCells && supported; i++) {
                        const fxOff = i * step;
                        const fxOffSq = fxOff * fxOff;
                        for (let j = -footCells; j <= footCells; j++) {
                            const fzOff = j * step;
                            if (fxOffSq + fzOff * fzOff > radiusSq) continue;

                            const fx = cx + fxOff;
                            const fz = cz + fzOff;

                            const down = collision.queryRay(fx, cy, fz, 0, -1, 0, RAY_MAX_DIST);
                            if (!down) {
                                supported = false;
                                break;
                            }
                            if (down.y > floor) floor = down.y;

                            const up = collision.queryRay(fx, cy, fz, 0, 1, 0, RAY_MAX_DIST);
                            if (up && up.y < ceiling) ceiling = up.y;
                        }
                    }

                    if (!supported) continue;

                    // Cylinder vertical extent = 2 × halfHeight. Need that
                    // much room between floor and ceiling.
                    if (floor + 2 * halfHeight > ceiling) continue;

                    bestDistSq = distSq;
                    out.x = cx;
                    out.y = floor;
                    out.z = cz;
                    found = true;
                }
            }
        }
    }

    return found;
};

export { findCylinderSpawn, findSphereSpawn };
