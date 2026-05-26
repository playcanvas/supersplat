import { math, Vec3 } from 'playcanvas';

import type { Collision, PushOut } from '../collision';

/** Small clearance that keeps the sphere from resting exactly on a collision surface */
const COLLISION_SKIN = 1e-3;

/** Maximum surface planes to slide along in a single frame */
const MAX_SLIDE_ITERATIONS = 3;

const MIN_MOVE_SQ = 1e-10;
const INV_SQRT2 = 1 / Math.sqrt(2);

const SWEEP_RAY_OFFSETS = [
    [0, 0, true],
    [1, 0, false],
    [-1, 0, false],
    [0, 1, false],
    [0, -1, false],
    [INV_SQRT2, INV_SQRT2, false],
    [-INV_SQRT2, INV_SQRT2, false],
    [-INV_SQRT2, -INV_SQRT2, false],
    [INV_SQRT2, -INV_SQRT2, false]
] as const;

const v = new Vec3();
const remainingMove = new Vec3();
const collisionPush = new Vec3();
const sweepDir = new Vec3();
const sweepNormal = new Vec3();
const sweepTangent = new Vec3();
const sweepBitangent = new Vec3();
const sweepOrigin = new Vec3();
const worldUp = new Vec3(0, 1, 0);
const worldRight = new Vec3(1, 0, 0);

/** Pre-allocated push-out vector for sphere collision */
const pushOut: PushOut = { x: 0, y: 0, z: 0 };

type SweepHit = {
    x: number;
    y: number;
    z: number;
    nx: number;
    ny: number;
    nz: number;
    travel: number;
};

const sweepHit: SweepHit = {
    x: 0,
    y: 0,
    z: 0,
    nx: 0,
    ny: 1,
    nz: 0,
    travel: 0
};

class SphereMover {
    collision: Collision | null = null;

    readonly radius: number;

    private _lastClearPosition = new Vec3();

    private _hasLastClearPosition = false;

    constructor(radius: number) {
        this.radius = radius;
    }

    reset(position: Vec3) {
        this._setLastClearPosition(position);
    }

    move(position: Vec3, move: Vec3) {
        if (!this.collision) {
            position.add(move);
            this._setLastClearPosition(position);
            return;
        }

        remainingMove.copy(move);

        if (this._isMoveComplete(remainingMove)) {
            this.resolve(position);
            return;
        }

        for (let i = 0; i < MAX_SLIDE_ITERATIONS; i++) {
            if (this._isMoveComplete(remainingMove)) {
                break;
            }

            if (!this._moveAndSlide(position, remainingMove)) {
                break;
            }
        }
    }

    resolve(position: Vec3) {
        if (!this.collision) {
            this._setLastClearPosition(position);
            return;
        }

        this._resolveSphere(position, collisionPush);
        if (!this._isSphereClear(position) && this._hasLastClearPosition) {
            position.copy(this._lastClearPosition);
        }

        if (this._isSphereClear(position)) {
            this._setLastClearPosition(position);
        }
    }

    private _moveAndSlide(position: Vec3, move: Vec3): boolean {
        const moveSq = move.x * move.x + move.y * move.y + move.z * move.z;
        const distance = Math.sqrt(moveSq);
        sweepDir.copy(move).mulScalar(1 / distance);

        if (!this._querySweep(position, sweepDir, distance, sweepHit)) {
            position.add(move);
            this.resolve(position);
            return false;
        }

        position.add(v.copy(sweepDir).mulScalar(sweepHit.travel));
        this.resolve(position);

        sweepNormal.set(sweepHit.nx, sweepHit.ny, sweepHit.nz);

        move.add(v.copy(sweepDir).mulScalar(-sweepHit.travel));
        this._clipMove(move, sweepNormal);

        return true;
    }

    private _querySweep(position: Vec3, dir: Vec3, distance: number, out: SweepHit): boolean {
        if (Math.abs(dir.y) < 0.99) {
            sweepTangent.cross(dir, worldUp).normalize();
        } else {
            sweepTangent.cross(dir, worldRight).normalize();
        }
        sweepBitangent.cross(dir, sweepTangent).normalize();

        let found = false;
        let bestTravel = Infinity;

        for (let i = 0; i < SWEEP_RAY_OFFSETS.length; i++) {
            const [tx, ty, centerRay] = SWEEP_RAY_OFFSETS[i];
            const radiusOffset = centerRay ? 0 : this.radius;
            const rayExtension = centerRay ? this.radius : 0;

            sweepOrigin.copy(position);
            if (!centerRay) {
                sweepOrigin.add(v.copy(sweepTangent).mulScalar(tx * radiusOffset));
                sweepOrigin.add(v.copy(sweepBitangent).mulScalar(ty * radiusOffset));
            }

            const hit = this.collision!.queryRay(
                sweepOrigin.x, sweepOrigin.y, sweepOrigin.z,
                dir.x, dir.y, dir.z,
                distance + rayExtension + COLLISION_SKIN
            );
            if (!hit) {
                continue;
            }

            const hx = hit.x - sweepOrigin.x;
            const hy = hit.y - sweepOrigin.y;
            const hz = hit.z - sweepOrigin.z;
            const hitDistance = Math.max(0, hx * dir.x + hy * dir.y + hz * dir.z);
            const clearance = centerRay ? this.radius : 0;
            const travel = math.clamp(hitDistance - clearance - COLLISION_SKIN, 0, distance);
            if (travel >= bestTravel) {
                continue;
            }

            const surfaceNormal = this.collision!.querySurfaceNormal(
                hit.x, hit.y, hit.z,
                dir.x, dir.y, dir.z
            );

            found = true;
            bestTravel = travel;
            out.x = hit.x;
            out.y = hit.y;
            out.z = hit.z;
            out.nx = surfaceNormal.nx;
            out.ny = surfaceNormal.ny;
            out.nz = surfaceNormal.nz;
            out.travel = travel;
        }

        return found;
    }

    private _resolveSphere(position: Vec3, push: Vec3): boolean {
        // `querySphere` is already corner-aware (resolveIterative inside the
        // collider iterates up to 4 passes with constraint-normal projection),
        // so a single call here is enough.
        if (!this.collision!.querySphere(position.x, position.y, position.z, this.radius, pushOut)) {
            push.set(0, 0, 0);
            return false;
        }

        position.x += pushOut.x;
        position.y += pushOut.y;
        position.z += pushOut.z;
        push.x = pushOut.x;
        push.y = pushOut.y;
        push.z = pushOut.z;
        return true;
    }

    private _clipMove(move: Vec3, push: Vec3) {
        const normalSq = push.x * push.x + push.y * push.y + push.z * push.z;
        if (normalSq <= MIN_MOVE_SQ) {
            return;
        }

        const invPushLen = 1 / Math.sqrt(normalSq);
        const nx = push.x * invPushLen;
        const ny = push.y * invPushLen;
        const nz = push.z * invPushLen;
        const dot = move.x * nx + move.y * ny + move.z * nz;

        if (dot < 0) {
            move.x -= dot * nx;
            move.y -= dot * ny;
            move.z -= dot * nz;
        }
    }

    private _isMoveComplete(move: Vec3): boolean {
        return move.x * move.x + move.y * move.y + move.z * move.z <= MIN_MOVE_SQ;
    }

    private _isSphereClear(position: Vec3): boolean {
        return !this.collision!.querySphere(position.x, position.y, position.z, this.radius, pushOut);
    }

    private _setLastClearPosition(position: Vec3) {
        this._lastClearPosition.copy(position);
        this._hasLastClearPosition = !this.collision || this._isSphereClear(position);
    }
}

export { SphereMover };
