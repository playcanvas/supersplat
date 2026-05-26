import {
    Asset,
    INDEXFORMAT_UINT32,
    SEMANTIC_POSITION
} from 'playcanvas';
import type { AppBase } from 'playcanvas';

import { DEFAULT_VOXEL_RESOLUTION, PENETRATION_EPSILON, resolveIterative } from './collision';
import type { Collision, PushOut, RayHit } from './collision';

// ---- BVH node layout ----

interface BVHNode {
    minX: number; minY: number; minZ: number;
    maxX: number; maxY: number; maxZ: number;
    left: BVHNode | null;
    right: BVHNode | null;
    triStart: number;
    triCount: number;
}

// ---- Triangle data (SoA for cache-friendly access) ----

interface TriangleData {
    // vertex positions (3 per triangle)
    v0x: Float32Array; v0y: Float32Array; v0z: Float32Array;
    v1x: Float32Array; v1y: Float32Array; v1z: Float32Array;
    v2x: Float32Array; v2y: Float32Array; v2z: Float32Array;
    // precomputed face normals
    nx: Float32Array; ny: Float32Array; nz: Float32Array;
    // triangle indices (for reordering during BVH build)
    indices: Uint32Array;
    count: number;
}

// Public view of the triangle SoA exposed by MeshCollision for debug
// overlays. The `readonly` qualifiers only prevent reassigning the *fields*;
// callers can technically still mutate the underlying typed arrays. By
// convention the buffers are owned by the collision and must not be written
// to — they back live BVH / collision queries.
interface TriangleSoA {
    readonly v0x: Float32Array; readonly v0y: Float32Array; readonly v0z: Float32Array;
    readonly v1x: Float32Array; readonly v1y: Float32Array; readonly v1z: Float32Array;
    readonly v2x: Float32Array; readonly v2y: Float32Array; readonly v2z: Float32Array;
    readonly nx: Float32Array; readonly ny: Float32Array; readonly nz: Float32Array;
    readonly count: number;
}

// ---- BVH construction ----

const MAX_LEAF_TRIS = 4;

function computeTriangleBounds(
    tris: TriangleData, idx: number,
    out: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }
) {
    const i = tris.indices[idx];
    out.minX = Math.min(tris.v0x[i], tris.v1x[i], tris.v2x[i]);
    out.minY = Math.min(tris.v0y[i], tris.v1y[i], tris.v2y[i]);
    out.minZ = Math.min(tris.v0z[i], tris.v1z[i], tris.v2z[i]);
    out.maxX = Math.max(tris.v0x[i], tris.v1x[i], tris.v2x[i]);
    out.maxY = Math.max(tris.v0y[i], tris.v1y[i], tris.v2y[i]);
    out.maxZ = Math.max(tris.v0z[i], tris.v1z[i], tris.v2z[i]);
}

function buildBVH(tris: TriangleData, start: number, count: number): BVHNode {
    const bounds = { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity };
    const tb = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };

    for (let i = start; i < start + count; i++) {
        computeTriangleBounds(tris, i, tb);
        bounds.minX = Math.min(bounds.minX, tb.minX);
        bounds.minY = Math.min(bounds.minY, tb.minY);
        bounds.minZ = Math.min(bounds.minZ, tb.minZ);
        bounds.maxX = Math.max(bounds.maxX, tb.maxX);
        bounds.maxY = Math.max(bounds.maxY, tb.maxY);
        bounds.maxZ = Math.max(bounds.maxZ, tb.maxZ);
    }

    if (count <= MAX_LEAF_TRIS) {
        return {
            ...bounds,
            left: null,
            right: null,
            triStart: start,
            triCount: count
        };
    }

    // Split along longest axis using midpoint
    const dx = bounds.maxX - bounds.minX;
    const dy = bounds.maxY - bounds.minY;
    const dz = bounds.maxZ - bounds.minZ;
    const axis = dx >= dy && dx >= dz ? 0 : (dy >= dz ? 1 : 2);
    const mid = axis === 0 ? (bounds.minX + bounds.maxX) * 0.5 :
        axis === 1 ? (bounds.minY + bounds.maxY) * 0.5 :
            (bounds.minZ + bounds.maxZ) * 0.5;

    // Partition indices[start..start+count) around the midpoint
    let left = start;
    let right = start + count - 1;
    while (left <= right) {
        const i = tris.indices[left];
        const cx = axis === 0 ? (tris.v0x[i] + tris.v1x[i] + tris.v2x[i]) / 3 :
            axis === 1 ? (tris.v0y[i] + tris.v1y[i] + tris.v2y[i]) / 3 :
                (tris.v0z[i] + tris.v1z[i] + tris.v2z[i]) / 3;
        if (cx < mid) {
            left++;
        } else {
            const tmp = tris.indices[left];
            tris.indices[left] = tris.indices[right];
            tris.indices[right] = tmp;
            right--;
        }
    }

    // Fall back to median split when midpoint produces a degenerate partition
    let leftCount = left - start;
    if (leftCount === 0 || leftCount === count) leftCount = count >> 1;

    return {
        ...bounds,
        left: buildBVH(tris, start, leftCount),
        right: buildBVH(tris, start + leftCount, count - leftCount),
        triStart: 0,
        triCount: 0
    };
}

// ---- Ray-AABB intersection ----

function rayAABB(
    ox: number, oy: number, oz: number,
    idx: number, idy: number, idz: number,
    minX: number, minY: number, minZ: number,
    maxX: number, maxY: number, maxZ: number,
    maxDist: number
): number {
    const t1x = (minX - ox) * idx;
    const t2x = (maxX - ox) * idx;
    const t1y = (minY - oy) * idy;
    const t2y = (maxY - oy) * idy;
    const t1z = (minZ - oz) * idz;
    const t2z = (maxZ - oz) * idz;

    const tmin = Math.max(Math.min(t1x, t2x), Math.min(t1y, t2y), Math.min(t1z, t2z));
    const tmax = Math.min(Math.max(t1x, t2x), Math.max(t1y, t2y), Math.max(t1z, t2z));

    if (tmax < 0 || tmin > tmax || tmin > maxDist) return -1;
    return tmin >= 0 ? tmin : 0;
}

// ---- Moller-Trumbore ray-triangle ----

function rayTriangle(
    ox: number, oy: number, oz: number,
    dx: number, dy: number, dz: number,
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number
): number {
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;

    const px = dy * e2z - dz * e2y;
    const py = dz * e2x - dx * e2z;
    const pz = dx * e2y - dy * e2x;

    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-10) return -1;

    const invDet = 1.0 / det;
    const tx = ox - ax, ty = oy - ay, tz = oz - az;
    const u = (tx * px + ty * py + tz * pz) * invDet;
    if (u < 0 || u > 1) return -1;

    const qx = ty * e1z - tz * e1y;
    const qy = tz * e1x - tx * e1z;
    const qz = tx * e1y - ty * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * invDet;
    if (v < 0 || u + v > 1) return -1;

    const t = (e2x * qx + e2y * qy + e2z * qz) * invDet;
    return t >= 0 ? t : -1;
}

// ---- Sphere-AABB overlap test ----

function sphereAABBOverlap(
    cx: number, cy: number, cz: number, radius: number,
    minX: number, minY: number, minZ: number,
    maxX: number, maxY: number, maxZ: number
): boolean {
    const nx = Math.max(minX, Math.min(cx, maxX));
    const ny = Math.max(minY, Math.min(cy, maxY));
    const nz = Math.max(minZ, Math.min(cz, maxZ));
    const dx = cx - nx, dy = cy - ny, dz = cz - nz;
    return dx * dx + dy * dy + dz * dz <= radius * radius;
}

// ---- Closest point on triangle to a point ----

function closestPointOnTriangle(
    px: number, py: number, pz: number,
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    out: { x: number; y: number; z: number }
) {
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const acx = cx - ax, acy = cy - ay, acz = cz - az;
    const apx = px - ax, apy = py - ay, apz = pz - az;

    const d1 = abx * apx + aby * apy + abz * apz;
    const d2 = acx * apx + acy * apy + acz * apz;
    if (d1 <= 0 && d2 <= 0) {
        out.x = ax; out.y = ay; out.z = az; return;
    }

    const bpx = px - bx, bpy = py - by, bpz = pz - bz;
    const d3 = abx * bpx + aby * bpy + abz * bpz;
    const d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) {
        out.x = bx; out.y = by; out.z = bz; return;
    }

    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) {
        const v = d1 / (d1 - d3);
        out.x = ax + abx * v; out.y = ay + aby * v; out.z = az + abz * v; return;
    }

    const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
    const d5 = abx * cpx + aby * cpy + abz * cpz;
    const d6 = acx * cpx + acy * cpy + acz * cpz;
    if (d6 >= 0 && d5 <= d6) {
        out.x = cx; out.y = cy; out.z = cz; return;
    }

    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) {
        const w = d2 / (d2 - d6);
        out.x = ax + acx * w; out.y = ay + acy * w; out.z = az + acz * w; return;
    }

    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
        const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
        out.x = bx + (cx - bx) * w; out.y = by + (cy - by) * w; out.z = bz + (cz - bz) * w; return;
    }

    const denom = 1.0 / (va + vb + vc);
    const v = vb * denom;
    const w = vc * denom;
    out.x = ax + abx * v + acx * w;
    out.y = ay + aby * v + acy * w;
    out.z = az + abz * v + acz * w;
}

// ---- Closest point on a line segment to a point ----

function closestPointOnSegment(
    px: number, py: number, pz: number,
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    out: { x: number; y: number; z: number }
) {
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const lenSq = abx * abx + aby * aby + abz * abz;
    if (lenSq < 1e-20) {
        out.x = ax; out.y = ay; out.z = az;
        return;
    }
    const apx = px - ax, apy = py - ay, apz = pz - az;
    let t = (apx * abx + apy * aby + apz * abz) / lenSq;
    t = Math.max(0, Math.min(1, t));
    out.x = ax + abx * t;
    out.y = ay + aby * t;
    out.z = az + abz * t;
}

// ---- Closest point on segment to triangle (returns distance squared) ----

const _segPt = { x: 0, y: 0, z: 0 };
const _triPt = { x: 0, y: 0, z: 0 };
const _tmpSegPt = { x: 0, y: 0, z: 0 };
const _tmpTriPt = { x: 0, y: 0, z: 0 };

// Approximate closest points between a line segment and a triangle.
// Uses discrete sampling (6 points along the segment) followed by one
// refinement pass. Sufficient for vertical capsule collision (walk/fly mode)
// where the segment is always Y-aligned and triangles are near-axis-aligned.
function closestSegmentTriangle(
    s0x: number, s0y: number, s0z: number,
    s1x: number, s1y: number, s1z: number,
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    outSeg: { x: number; y: number; z: number },
    outTri: { x: number; y: number; z: number }
): number {
    const SAMPLES = 5;
    let bestDistSq = Infinity;

    for (let i = 0; i <= SAMPLES; i++) {
        const t = i / SAMPLES;
        const sx = s0x + (s1x - s0x) * t;
        const sy = s0y + (s1y - s0y) * t;
        const sz = s0z + (s1z - s0z) * t;

        closestPointOnTriangle(sx, sy, sz, ax, ay, az, bx, by, bz, cx, cy, cz, _tmpTriPt);
        const dx = sx - _tmpTriPt.x, dy = sy - _tmpTriPt.y, dz = sz - _tmpTriPt.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq < bestDistSq) {
            bestDistSq = distSq;
            _segPt.x = sx; _segPt.y = sy; _segPt.z = sz;
            _triPt.x = _tmpTriPt.x; _triPt.y = _tmpTriPt.y; _triPt.z = _tmpTriPt.z;
        }
    }

    // Refine: find closest point on segment to the best triangle point, then re-test
    closestPointOnSegment(_triPt.x, _triPt.y, _triPt.z, s0x, s0y, s0z, s1x, s1y, s1z, _tmpSegPt);
    closestPointOnTriangle(_tmpSegPt.x, _tmpSegPt.y, _tmpSegPt.z, ax, ay, az, bx, by, bz, cx, cy, cz, _tmpTriPt);
    const dx = _tmpSegPt.x - _tmpTriPt.x;
    const dy = _tmpSegPt.y - _tmpTriPt.y;
    const dz = _tmpSegPt.z - _tmpTriPt.z;
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq < bestDistSq) {
        bestDistSq = distSq;
        _segPt.x = _tmpSegPt.x; _segPt.y = _tmpSegPt.y; _segPt.z = _tmpSegPt.z;
        _triPt.x = _tmpTriPt.x; _triPt.y = _tmpTriPt.y; _triPt.z = _tmpTriPt.z;
    }

    outSeg.x = _segPt.x; outSeg.y = _segPt.y; outSeg.z = _segPt.z;
    outTri.x = _triPt.x; outTri.y = _triPt.y; outTri.z = _triPt.z;
    return bestDistSq;
}

// ---- MeshCollision ----

const _closest = { x: 0, y: 0, z: 0 };
const _segClosest = { x: 0, y: 0, z: 0 };
const _triClosest = { x: 0, y: 0, z: 0 };

class MeshCollision implements Collision {
    /**
     * Assumed voxel resolution of the source carve that produced this mesh.
     * The mesh itself doesn't carry this metadata, so we fall back to the
     * default; can be overridden post-construction if a loader knows better.
     */
    voxelResolution: number = DEFAULT_VOXEL_RESOLUTION;

    private _tris: TriangleData;

    private _root: BVHNode;

    private readonly _normalResult = { nx: 0, ny: 0, nz: 0 };

    private readonly _push: PushOut = { x: 0, y: 0, z: 0 };

    private readonly _constraintNormals = [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 }
    ];

    private _stack: (BVHNode | null)[] = [];

    private readonly _rayResult = { t: -1, triIdx: -1 };

    constructor(positions: Float32Array, indices: Uint32Array | Uint16Array) {
        const numTris = Math.floor(indices.length / 3);
        const tris: TriangleData = {
            v0x: new Float32Array(numTris),
            v0y: new Float32Array(numTris),
            v0z: new Float32Array(numTris),
            v1x: new Float32Array(numTris),
            v1y: new Float32Array(numTris),
            v1z: new Float32Array(numTris),
            v2x: new Float32Array(numTris),
            v2y: new Float32Array(numTris),
            v2z: new Float32Array(numTris),
            nx: new Float32Array(numTris),
            ny: new Float32Array(numTris),
            nz: new Float32Array(numTris),
            indices: new Uint32Array(numTris),
            count: numTris
        };

        for (let i = 0; i < numTris; i++) {
            const i0 = indices[i * 3] * 3;
            const i1 = indices[i * 3 + 1] * 3;
            const i2 = indices[i * 3 + 2] * 3;

            tris.v0x[i] = positions[i0]; tris.v0y[i] = positions[i0 + 1]; tris.v0z[i] = positions[i0 + 2];
            tris.v1x[i] = positions[i1]; tris.v1y[i] = positions[i1 + 1]; tris.v1z[i] = positions[i1 + 2];
            tris.v2x[i] = positions[i2]; tris.v2y[i] = positions[i2 + 1]; tris.v2z[i] = positions[i2 + 2];

            // face normal
            const e1x = tris.v1x[i] - tris.v0x[i];
            const e1y = tris.v1y[i] - tris.v0y[i];
            const e1z = tris.v1z[i] - tris.v0z[i];
            const e2x = tris.v2x[i] - tris.v0x[i];
            const e2y = tris.v2y[i] - tris.v0y[i];
            const e2z = tris.v2z[i] - tris.v0z[i];
            let fnx = e1y * e2z - e1z * e2y;
            let fny = e1z * e2x - e1x * e2z;
            let fnz = e1x * e2y - e1y * e2x;
            const len = Math.sqrt(fnx * fnx + fny * fny + fnz * fnz);
            if (len > 1e-10) {
                const invLen = 1.0 / len;
                fnx *= invLen; fny *= invLen; fnz *= invLen;
            }
            tris.nx[i] = fnx; tris.ny[i] = fny; tris.nz[i] = fnz;

            tris.indices[i] = i;
        }

        this._tris = tris;
        this._root = buildBVH(tris, 0, numTris);
    }

    // ---- Public accessors ----

    /**
     * Read-only view of the de-indexed triangle data, used by debug overlays.
     * The underlying typed arrays are reused and must not be mutated.
     *
     * @returns the triangle SoA backing this collision.
     */
    get triangles(): TriangleSoA {
        return this._tris;
    }

    // ---- Collision interface ----

    queryRay(
        ox: number, oy: number, oz: number,
        dx: number, dy: number, dz: number,
        maxDist: number
    ): RayHit | null {
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (len < 1e-10) return null;
        const invLen = 1.0 / len;
        dx *= invLen; dy *= invLen; dz *= invLen;

        const idx = 1.0 / (Math.abs(dx) > 1e-12 ? dx : (dx >= 0 ? 1e-12 : -1e-12));
        const idy = 1.0 / (Math.abs(dy) > 1e-12 ? dy : (dy >= 0 ? 1e-12 : -1e-12));
        const idz = 1.0 / (Math.abs(dz) > 1e-12 ? dz : (dz >= 0 ? 1e-12 : -1e-12));

        const hit = this._queryRayBVH(ox, oy, oz, dx, dy, dz, idx, idy, idz, maxDist);
        if (!hit) return null;

        return {
            x: ox + dx * hit.t,
            y: oy + dy * hit.t,
            z: oz + dz * hit.t
        };
    }

    querySphere(
        cx: number, cy: number, cz: number,
        radius: number,
        out: PushOut
    ): boolean {
        return resolveIterative(
            cx, cy, cz,
            (rx, ry, rz, push) => this._deepestSpherePenetration(rx, ry, rz, radius, push),
            this._constraintNormals, this._push, out
        );
    }

    queryCapsule(
        cx: number, cy: number, cz: number,
        halfHeight: number,
        radius: number,
        out: PushOut
    ): boolean {
        return resolveIterative(
            cx, cy, cz,
            (rx, ry, rz, push) => this._deepestCapsulePenetration(rx, ry, rz, halfHeight, radius, push),
            this._constraintNormals, this._push, out
        );
    }

    isFreeAt(x: number, y: number, z: number): boolean {
        // Approximation: a point is in free space iff no triangle is within
        // half a voxel of it. Matches the voxel-grid notion for data derived
        // from the same carve.
        return !this._deepestSpherePenetration(x, y, z, this.voxelResolution * 0.5, this._push);
    }

    querySurfaceNormal(
        x: number, y: number, z: number,
        rdx: number, rdy: number, rdz: number
    ): { nx: number; ny: number; nz: number } {
        const len = Math.sqrt(rdx * rdx + rdy * rdy + rdz * rdz);
        if (len < 1e-10) {
            this._normalResult.nx = 0;
            this._normalResult.ny = 1;
            this._normalResult.nz = 0;
            return this._normalResult;
        }

        const invLen = 1.0 / len;
        const dx = rdx * invLen;
        const dy = rdy * invLen;
        const dz = rdz * invLen;

        const idx = 1.0 / (Math.abs(dx) > 1e-12 ? dx : (dx >= 0 ? 1e-12 : -1e-12));
        const idy = 1.0 / (Math.abs(dy) > 1e-12 ? dy : (dy >= 0 ? 1e-12 : -1e-12));
        const idz = 1.0 / (Math.abs(dz) > 1e-12 ? dz : (dz >= 0 ? 1e-12 : -1e-12));

        const hit = this._queryRayBVH(x, y, z, dx, dy, dz, idx, idy, idz, 1.0);

        const result = this._normalResult;
        if (hit) {
            const i = hit.triIdx;
            result.nx = this._tris.nx[i];
            result.ny = this._tris.ny[i];
            result.nz = this._tris.nz[i];
            // Ensure normal faces toward the ray origin (against the ray direction)
            const dot = result.nx * dx + result.ny * dy + result.nz * dz;
            if (dot > 0) {
                result.nx = -result.nx;
                result.ny = -result.ny;
                result.nz = -result.nz;
            }
        } else {
            result.nx = 0;
            result.ny = 1;
            result.nz = 0;
        }
        return result;
    }

    // ---- BVH ray traversal (iterative, returns both t and triangle index) ----

    private _queryRayBVH(
        ox: number, oy: number, oz: number,
        dx: number, dy: number, dz: number,
        idx: number, idy: number, idz: number,
        maxDist: number
    ): typeof this._rayResult | null {
        const root = this._root;
        if (rayAABB(ox, oy, oz, idx, idy, idz,
            root.minX, root.minY, root.minZ,
            root.maxX, root.maxY, root.maxZ, maxDist) < 0) {
            return null;
        }

        const stack = this._stack;
        let top = 0;
        stack[top++] = root;

        let bestT = maxDist + 1;
        let bestTriIdx = -1;
        const { _tris: tris } = this;

        while (top > 0) {
            const node = stack[--top]!;

            if (node.left === null) {
                for (let j = node.triStart; j < node.triStart + node.triCount; j++) {
                    const i = tris.indices[j];
                    const ht = rayTriangle(
                        ox, oy, oz, dx, dy, dz,
                        tris.v0x[i], tris.v0y[i], tris.v0z[i],
                        tris.v1x[i], tris.v1y[i], tris.v1z[i],
                        tris.v2x[i], tris.v2y[i], tris.v2z[i]
                    );
                    if (ht >= 0 && ht <= maxDist && ht < bestT) {
                        bestT = ht;
                        bestTriIdx = i;
                    }
                }
                continue;
            }

            const tLeft = rayAABB(ox, oy, oz, idx, idy, idz,
                node.left.minX, node.left.minY, node.left.minZ,
                node.left.maxX, node.left.maxY, node.left.maxZ, bestT);
            const tRight = rayAABB(ox, oy, oz, idx, idy, idz,
                node.right!.minX, node.right!.minY, node.right!.minZ,
                node.right!.maxX, node.right!.maxY, node.right!.maxZ, bestT);

            // Push farther child first so nearer child is popped first
            if (tLeft >= 0 && tRight >= 0) {
                if (tLeft <= tRight) {
                    stack[top++] = node.right;
                    stack[top++] = node.left;
                } else {
                    stack[top++] = node.left;
                    stack[top++] = node.right;
                }
            } else if (tLeft >= 0) {
                stack[top++] = node.left;
            } else if (tRight >= 0) {
                stack[top++] = node.right;
            }
        }

        if (bestTriIdx < 0) return null;

        const result = this._rayResult;
        result.t = bestT;
        result.triIdx = bestTriIdx;
        return result;
    }

    // ---- Sphere deepest penetration (single triangle) ----

    private _deepestSpherePenetration(
        cx: number, cy: number, cz: number,
        radius: number,
        out: PushOut
    ): boolean {
        let bestPen = PENETRATION_EPSILON;
        let bestPx = 0, bestPy = 0, bestPz = 0;
        let found = false;

        this._sphereBVH(this._root, cx, cy, cz, radius, (triIdx: number) => {
            const tris = this._tris;
            closestPointOnTriangle(
                cx, cy, cz,
                tris.v0x[triIdx], tris.v0y[triIdx], tris.v0z[triIdx],
                tris.v1x[triIdx], tris.v1y[triIdx], tris.v1z[triIdx],
                tris.v2x[triIdx], tris.v2y[triIdx], tris.v2z[triIdx],
                _closest
            );

            const dx = cx - _closest.x;
            const dy = cy - _closest.y;
            const dz = cz - _closest.z;
            const distSq = dx * dx + dy * dy + dz * dz;

            if (distSq >= radius * radius) return;

            const dist = Math.sqrt(distSq);
            const penetration = radius - dist;

            if (penetration > bestPen) {
                bestPen = penetration;
                if (dist > 1e-10) {
                    const invDist = 1.0 / dist;
                    bestPx = dx * invDist * penetration;
                    bestPy = dy * invDist * penetration;
                    bestPz = dz * invDist * penetration;
                } else {
                    bestPx = tris.nx[triIdx] * penetration;
                    bestPy = tris.ny[triIdx] * penetration;
                    bestPz = tris.nz[triIdx] * penetration;
                }
                found = true;
            }
        });

        if (found) {
            out.x = bestPx;
            out.y = bestPy;
            out.z = bestPz;
        }
        return found;
    }

    // ---- Capsule deepest penetration (single triangle) ----

    private _deepestCapsulePenetration(
        cx: number, cy: number, cz: number,
        halfHeight: number,
        radius: number,
        out: PushOut
    ): boolean {
        let bestPen = PENETRATION_EPSILON;
        let bestPx = 0, bestPy = 0, bestPz = 0;
        let found = false;

        const s0x = cx, s0y = cy - halfHeight, s0z = cz;
        const s1x = cx, s1y = cy + halfHeight, s1z = cz;

        const capsuleRadius = radius;
        const capsuleCenterY = cy;
        const capsuleHalfExtentY = halfHeight + radius;

        this._capsuleBVH(this._root, cx, capsuleCenterY, cz, capsuleHalfExtentY, capsuleRadius, (triIdx: number) => {
            const tris = this._tris;
            closestSegmentTriangle(
                s0x, s0y, s0z, s1x, s1y, s1z,
                tris.v0x[triIdx], tris.v0y[triIdx], tris.v0z[triIdx],
                tris.v1x[triIdx], tris.v1y[triIdx], tris.v1z[triIdx],
                tris.v2x[triIdx], tris.v2y[triIdx], tris.v2z[triIdx],
                _segClosest, _triClosest
            );

            const dx = _segClosest.x - _triClosest.x;
            const dy = _segClosest.y - _triClosest.y;
            const dz = _segClosest.z - _triClosest.z;
            const distSq = dx * dx + dy * dy + dz * dz;

            if (distSq >= radius * radius) return;

            const dist = Math.sqrt(distSq);
            const penetration = radius - dist;

            if (penetration > bestPen) {
                bestPen = penetration;
                if (dist > 1e-10) {
                    const invDist = 1.0 / dist;
                    bestPx = dx * invDist * penetration;
                    bestPy = dy * invDist * penetration;
                    bestPz = dz * invDist * penetration;
                } else {
                    bestPx = tris.nx[triIdx] * penetration;
                    bestPy = tris.ny[triIdx] * penetration;
                    bestPz = tris.nz[triIdx] * penetration;
                }
                found = true;
            }
        });

        if (found) {
            out.x = bestPx;
            out.y = bestPy;
            out.z = bestPz;
        }
        return found;
    }

    // ---- BVH sphere traversal (iterative) ----

    private _sphereBVH(
        root: BVHNode,
        cx: number, cy: number, cz: number,
        radius: number,
        callback: (triIdx: number) => void
    ) {
        const stack = this._stack;
        let top = 0;
        stack[top++] = root;

        while (top > 0) {
            const node = stack[--top]!;

            if (!sphereAABBOverlap(cx, cy, cz, radius,
                node.minX, node.minY, node.minZ,
                node.maxX, node.maxY, node.maxZ)) {
                continue;
            }

            if (node.left === null) {
                const { _tris: tris } = this;
                for (let j = node.triStart; j < node.triStart + node.triCount; j++) {
                    callback(tris.indices[j]);
                }
                continue;
            }

            stack[top++] = node.right;
            stack[top++] = node.left;
        }
    }

    // ---- BVH capsule traversal (iterative, uses AABB of the capsule) ----

    private _capsuleBVH(
        root: BVHNode,
        cx: number, cy: number, cz: number,
        halfExtentY: number,
        radius: number,
        callback: (triIdx: number) => void
    ) {
        const capMinX = cx - radius;
        const capMaxX = cx + radius;
        const capMinY = cy - halfExtentY;
        const capMaxY = cy + halfExtentY;
        const capMinZ = cz - radius;
        const capMaxZ = cz + radius;

        const stack = this._stack;
        let top = 0;
        stack[top++] = root;

        while (top > 0) {
            const node = stack[--top]!;

            if (capMaxX < node.minX || capMinX > node.maxX ||
                capMaxY < node.minY || capMinY > node.maxY ||
                capMaxZ < node.minZ || capMinZ > node.maxZ) {
                continue;
            }

            if (node.left === null) {
                const { _tris: tris } = this;
                for (let j = node.triStart; j < node.triStart + node.triCount; j++) {
                    callback(tris.indices[j]);
                }
                continue;
            }

            stack[top++] = node.right;
            stack[top++] = node.left;
        }
    }

    // ---- Static factory ----

    /**
     * Load a GLB file via the PlayCanvas asset system, extract mesh geometry,
     * and construct a MeshCollision. The GLB entity is not added to the scene;
     * only the vertex/index data is used.
     *
     * @param app - PlayCanvas application instance.
     * @param url - URL to the .glb file.
     * @returns A promise resolving to a MeshCollision.
     */
    static fromGlb(app: AppBase, url: string): Promise<MeshCollision> {
        return new Promise((resolve, reject) => {
            const asset = new Asset(url, 'container', { url });

            const cleanup = () => {
                app.assets.remove(asset);
                asset.unload();
            };

            asset.on('load', () => {
                const renders = (asset.resource as any).renders as any[];
                if (!renders || renders.length === 0) {
                    cleanup();
                    reject(new Error('GLB contains no mesh data'));
                    return;
                }

                const allPositions: number[] = [];
                const allIndices: number[] = [];
                let vertexOffset = 0;

                for (const renderAsset of renders) {
                    const render = renderAsset.resource;
                    for (let m = 0; m < render.meshes.length; m++) {
                        const mesh = render.meshes[m];
                        const vb = mesh.vertexBuffer;
                        const ib = mesh.indexBuffer[0];

                        if (!vb || !ib) continue;

                        const format = vb.format;
                        let posElement: any = null;
                        for (let e = 0; e < format.elements.length; e++) {
                            if (format.elements[e].name === SEMANTIC_POSITION) {
                                posElement = format.elements[e];
                                break;
                            }
                        }
                        if (!posElement) continue;

                        const data = new Float32Array(vb.storage);
                        const stride = format.size / 4;
                        const offset = posElement.offset / 4;
                        const numVerts = vb.numVertices;

                        for (let v = 0; v < numVerts; v++) {
                            const base = v * stride + offset;
                            allPositions.push(data[base], data[base + 1], data[base + 2]);
                        }

                        const indexData = ib.format === INDEXFORMAT_UINT32 ?
                            new Uint32Array(ib.storage) :
                            new Uint16Array(ib.storage);

                        for (const prim of mesh.primitive) {
                            for (let i = 0; i < prim.count; i++) {
                                allIndices.push(indexData[prim.base + i] + vertexOffset);
                            }
                        }

                        vertexOffset += numVerts;
                    }
                }

                if (allIndices.length === 0) {
                    cleanup();
                    reject(new Error('GLB meshes contain no triangle data'));
                    return;
                }

                const collision = new MeshCollision(
                    new Float32Array(allPositions),
                    new Uint32Array(allIndices)
                );

                cleanup();
                resolve(collision);
            });

            asset.on('error', (err: string) => {
                cleanup();
                reject(new Error(err));
            });

            app.assets.add(asset);
            app.assets.load(asset);
        });
    }
}

export { MeshCollision };
export type { TriangleSoA };
