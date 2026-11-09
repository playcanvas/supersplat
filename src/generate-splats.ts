import { Mat4, Quat, Vec3 } from 'playcanvas';

import { dcEncode, invSigmoid } from './color-grade';

// World-space gaussians, structure of arrays. Scales are linear standard
// deviations; rotations are quaternions [x,y,z,w]; colours and opacity 0-1.
type GaussianData = {
    positions: Float32Array;
    scales: Float32Array;
    rotations: Float32Array;
    colors: Float32Array;
    opacities: Float32Array;
};

type PrimitiveShape = 'sphere' | 'box' | 'plane' | 'cylinder' | 'cone';

type PrimitiveSpec = {
    shape: PrimitiveShape;
    center: Vec3;
    size: Vec3;             // full extents; Y is the axis of cylinders and cones, planes lie in XZ
    rotation: Quat;
    fill: 'surface' | 'volume';
    count: number;
    color: [number, number, number];
    opacity: number;
    splatSize?: number;     // standard deviation in world units; derived from spacing when omitted
};

type GaussianColumn = { name: string, data: Float32Array };

// Encode as standard 3DGS columns (the PLY property convention used by
// splat-transform: log scales, logit opacity, SH DC colour, rot_0 = w).
const toColumns = (data: GaussianData): GaussianColumn[] => {
    const { positions, scales, rotations, colors, opacities } = data;
    const count = opacities.length;
    const columns = ['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3']
    .map(name => ({ name, data: new Float32Array(count) }));
    const [x, y, z, r, g, b, alpha, s0, s1, s2, qw, qx, qy, qz] = columns.map(c => c.data);
    const q = new Quat();
    for (let i = 0; i < count; i++) {
        q.set(rotations[i * 4], rotations[i * 4 + 1], rotations[i * 4 + 2], rotations[i * 4 + 3]).normalize();
        x[i] = positions[i * 3];
        y[i] = positions[i * 3 + 1];
        z[i] = positions[i * 3 + 2];
        r[i] = dcEncode(colors[i * 3]);
        g[i] = dcEncode(colors[i * 3 + 1]);
        b[i] = dcEncode(colors[i * 3 + 2]);
        alpha[i] = invSigmoid(opacities[i]);
        s0[i] = Math.log(scales[i * 3]);
        s1[i] = Math.log(scales[i * 3 + 1]);
        s2[i] = Math.log(scales[i * 3 + 2]);
        qw[i] = q.w;
        qx[i] = q.x;
        qy[i] = q.y;
        qz[i] = q.z;
    }
    return columns;
};

// Low-discrepancy R-sequences (Roberts): even coverage at any count, unlike
// random samples, and deterministic so a repeated call creates the same shape.
const phi = (d: number) => {
    let x = 2;
    for (let i = 0; i < 20; i++) x = Math.pow(1 + x, 1 / (d + 1));
    return x;
};
const R2 = [1 / phi(2), 1 / (phi(2) * phi(2))];
const R3 = [1 / phi(3), 1 / (phi(3) ** 2), 1 / (phi(3) ** 3)];
const frac = (v: number) => v - Math.floor(v);

// deterministic integer hash of (i, seed) to [0, 1)
const hash01 = (i: number, seed: number) => {
    let h = Math.imul(i ^ Math.imul(seed, 0x9e3779b9), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
};

// Split count across parts in proportion to weight (largest remainder).
const allocate = (count: number, weights: number[]) => {
    const total = weights.reduce((a, b) => a + b, 0);
    const exact = weights.map(w => count * w / total);
    const counts = exact.map(Math.floor);
    const order = exact.map((e, i) => i).sort((a, b) => (exact[b] - counts[b]) - (exact[a] - counts[a]));
    const remainder = count - counts.reduce((a, b) => a + b, 0);
    for (let i = 0; i < remainder; i++) counts[order[i]]++;
    return counts;
};

const TAU = Math.PI * 2;
const ellipsePerimeter = (a: number, b: number) => Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));

// A surface part samples points and outward normals in the unit shape
// ([-0.5, 0.5] on each axis) from a 2D low-discrepancy pair.
type Part = { area: number, sample: (u: number, v: number, p: Vec3, n: Vec3) => void };

const surfaceParts = (shape: PrimitiveShape, s: Vec3): Part[] => {
    switch (shape) {
        case 'sphere': {
            // Thomsen's approximation of ellipsoid surface area
            const a = s.x / 2, b = s.y / 2, c = s.z / 2, k = 1.6075;
            const area = 4 * Math.PI * Math.pow((Math.pow(a * b, k) + Math.pow(a * c, k) + Math.pow(b * c, k)) / 3, 1 / k);
            return [{ area,
                sample: (u, v, p, n) => {
                    const y = 1 - 2 * u, r = Math.sqrt(1 - y * y), t = TAU * v;
                    n.set(r * Math.cos(t), y, r * Math.sin(t));
                    p.copy(n).mulScalar(0.5);
                } }];
        }
        case 'box':
            return [0, 1, 2].flatMap(axis => [-1, 1].map(side => ({
                area: [s.y * s.z, s.x * s.z, s.x * s.y][axis],
                sample: (u: number, v: number, p: Vec3, n: Vec3) => {
                    const c = [u - 0.5, v - 0.5];
                    const values = [0, 1, 2].map(i => (i === axis ? side * 0.5 : c.shift()));
                    p.set(values[0], values[1], values[2]);
                    n.set(0, 0, 0);
                    n[(['x', 'y', 'z'] as const)[axis]] = side;
                }
            })));
        case 'plane':
            return [{ area: s.x * s.z,
                sample: (u, v, p, n) => {
                    p.set(u - 0.5, 0, v - 0.5);
                    n.set(0, 1, 0);
                } }];
        case 'cylinder': {
            const cap = Math.PI * s.x * s.z / 4;
            const disc = (y: number) => ({ area: cap,
                sample: (u: number, v: number, p: Vec3, n: Vec3) => {
                    const r = 0.5 * Math.sqrt(u), t = TAU * v;
                    p.set(r * Math.cos(t), y, r * Math.sin(t));
                    n.set(0, Math.sign(y), 0);
                } });
            return [{ area: ellipsePerimeter(s.x / 2, s.z / 2) * s.y,
                sample: (u, v, p, n) => {
                    const t = TAU * u;
                    n.set(Math.cos(t), 0, Math.sin(t));
                    p.set(0.5 * n.x, v - 0.5, 0.5 * n.z);
                } }, disc(-0.5), disc(0.5)];
        }
        case 'cone': {
            // apex at +Y; lateral area density grows linearly from the apex
            const r = (s.x + s.z) / 4;
            return [{ area: Math.PI * r * Math.sqrt(s.y * s.y + r * r),
                sample: (u, v, p, n) => {
                    const d = Math.sqrt(u), t = TAU * v;
                    p.set(0.5 * d * Math.cos(t), 0.5 - d, 0.5 * d * Math.sin(t));
                    n.set(Math.cos(t), 0.5, Math.sin(t));
                } }, { area: Math.PI * s.x * s.z / 4,
                sample: (u, v, p, n) => {
                    const d = 0.5 * Math.sqrt(u), t = TAU * v;
                    p.set(d * Math.cos(t), -0.5, d * Math.sin(t));
                    n.set(0, -1, 0);
                } }];
        }
    }
};

// Volume samplers map a 3D low-discrepancy triple into the unit shape.
const volumeSample = (shape: PrimitiveShape, u: number, v: number, w: number, p: Vec3) => {
    switch (shape) {
        case 'sphere': {
            const r = 0.5 * Math.cbrt(u), y = 1 - 2 * v, h = Math.sqrt(1 - y * y), t = TAU * w;
            p.set(r * h * Math.cos(t), r * y, r * h * Math.sin(t));
            break;
        }
        case 'box':
            p.set(u - 0.5, v - 0.5, w - 0.5);
            break;
        case 'cylinder': {
            const r = 0.5 * Math.sqrt(u), t = TAU * v;
            p.set(r * Math.cos(t), w - 0.5, r * Math.sin(t));
            break;
        }
        case 'cone': {
            const d = Math.cbrt(u), r = 0.5 * d * Math.sqrt(v), t = TAU * w;
            p.set(r * Math.cos(t), 0.5 - d, r * Math.sin(t));
            break;
        }
    }
};

const volumeOf = (shape: PrimitiveShape, s: Vec3) => s.x * s.y * s.z * ({ sphere: Math.PI / 6, box: 1, plane: 0, cylinder: Math.PI / 4, cone: Math.PI / 12 })[shape];

// Rotation taking local +Z to unit vector n; the tangent frame is arbitrary
// because surface splats are round in the tangent plane.
const alignZ = (n: Vec3, q: Quat) => {
    const d = n.z;
    if (d < -0.999999) return q.set(1, 0, 0, 0);
    return q.set(-n.y, n.x, 0, 1 + d).normalize();
};

const samplePrimitive = (spec: PrimitiveSpec): GaussianData => {
    const { shape, center, size, rotation, count, color, opacity } = spec;
    const surface = spec.fill === 'surface' || shape === 'plane';
    const data: GaussianData = {
        positions: new Float32Array(count * 3),
        scales: new Float32Array(count * 3),
        rotations: new Float32Array(count * 4),
        colors: new Float32Array(count * 3),
        opacities: new Float32Array(count).fill(opacity)
    };
    const p = new Vec3(), n = new Vec3(), q = new Quat();
    const inverseSize = new Vec3(1 / Math.max(size.x, 1e-12), 1 / Math.max(size.y, 1e-12), 1 / Math.max(size.z, 1e-12));
    const write = (i: number, normal: Vec3 | null, sigma: number) => {
        p.mul(size);
        rotation.transformVector(p, p).add(center);
        data.positions.set([p.x, p.y, p.z], i * 3);
        data.colors.set(color, i * 3);
        if (normal) {
            // normals transform by the inverse transpose of the scale
            normal.mul(inverseSize);
            rotation.transformVector(normal, normal).normalize();
            alignZ(normal, q);
            data.scales.set([sigma, sigma, sigma * 0.1], i * 3);
        } else {
            q.set(0, 0, 0, 1);
            data.scales.set([sigma, sigma, sigma], i * 3);
        }
        data.rotations.set([q.x, q.y, q.z, q.w], i * 4);
    };

    if (surface) {
        const parts = surfaceParts(shape, size);
        const area = parts.reduce((a, part) => a + part.area, 0);
        // low-discrepancy points are not a grid; 0.7 spacing hides their lattice
        const sigma = spec.splatSize ?? 0.7 * Math.sqrt(area / count);
        let i = 0;
        allocate(count, parts.map(part => part.area)).forEach((partCount, index) => {
            // a small deterministic jitter, under half the sample spacing, breaks
            // the R2 lattice that otherwise shows as diagonal streaks on flat faces
            const jitter = 0.45 / Math.sqrt(Math.max(partCount, 1));
            for (let j = 0; j < partCount; j++, i++) {
                parts[index].sample(frac(0.5 + R2[0] * j + jitter * (hash01(j, 1) - 0.5)), frac(0.5 + R2[1] * j + jitter * (hash01(j, 2) - 0.5)), p, n);
                write(i, n, sigma);
            }
        });
    } else {
        const sigma = spec.splatSize ?? 0.5 * Math.cbrt(volumeOf(shape, size) / count);
        for (let i = 0; i < count; i++) {
            volumeSample(shape, frac(0.5 + R3[0] * i), frac(0.5 + R3[1] * i), frac(0.5 + R3[2] * i), p);
            write(i, null, sigma);
        }
    }
    return data;
};

// Sample several parts into one set of gaussians, so a multi-part object
// becomes a single static resource that instances can share.
const samplePrimitives = (parts: PrimitiveSpec[]): GaussianData => {
    const sampled = parts.map(samplePrimitive);
    const join = (key: keyof GaussianData) => {
        const out = new Float32Array(sampled.reduce((n, d) => n + d[key].length, 0));
        let at = 0;
        for (const d of sampled) {
            out.set(d[key], at);
            at += d[key].length;
        }
        return out;
    };
    return { positions: join('positions'), scales: join('scales'), rotations: join('rotations'), colors: join('colors'), opacities: join('opacities') };
};

// --- signed distance fields ---

type SdfShape = 'box' | 'ellipsoid' | 'cylinder' | 'capsule' | 'torus' | 'extrusion';

type SdfNode = {
    shape: SdfShape;
    center: Vec3;
    size?: Vec3;                // full extents; cylinders, capsules and tori run along local Y
    rotation: Quat;
    round?: number;             // corner radius for boxes, cylinders and extrusions
    op?: 'union' | 'subtract' | 'intersect';
    smooth?: number;            // blend radius with the shapes before it
    color?: [number, number, number];
    // extrusion: a closed outline in local XY, extruded along local Z by depth
    profile?: [number, number][];
    depth?: number;
    // local X and Z scale at the shape's top (+Y) relative to its bottom
    taper?: [number, number];
    // reflect across the world plane through the origin normal to this axis
    mirror?: 'x' | 'y' | 'z';
};

type SdfSpec = {
    nodes: SdfNode[];
    count: number;
    opacity: number;
    splatSize?: number;
};

type SdfColor = [number, number, number];

// Signed distance to a closed 2D polygon (Quilez): negative inside.
const polygonDistance = (v: [number, number][], px: number, py: number) => {
    let d = (px - v[0][0]) ** 2 + (py - v[0][1]) ** 2;
    let s = 1;
    for (let i = 0, j = v.length - 1; i < v.length; j = i, i++) {
        const ex = v[j][0] - v[i][0], ey = v[j][1] - v[i][1];
        const wx = px - v[i][0], wy = py - v[i][1];
        const t = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey)));
        const bx = wx - ex * t, by = wy - ey * t;
        d = Math.min(d, bx * bx + by * by);
        const c1 = py >= v[i][1], c2 = py < v[j][1], c3 = ex * wy > ey * wx;
        if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
    }
    return s * Math.sqrt(d);
};

// Distance from a local point to a shape centred at the origin.
const shapeDistance = (shape: SdfShape, x: number, y: number, z: number, hx: number, hy: number, hz: number, round: number, profile?: [number, number][]) => {
    switch (shape) {
        case 'extrusion': {
            // shrink the outline by the corner radius, then round it back out, so
            // outline corners and extruded edges share the radius
            const r = Math.min(round, hz);
            const d2 = polygonDistance(profile, x, y) + r;
            const dz = Math.abs(z) - (hz - r);
            return Math.min(Math.max(d2, dz), 0) + Math.hypot(Math.max(d2, 0), Math.max(dz, 0)) - r;
        }
        case 'box': {
            const r = Math.min(round, hx, hy, hz);
            const qx = Math.abs(x) - (hx - r), qy = Math.abs(y) - (hy - r), qz = Math.abs(z) - (hz - r);
            return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
        }
        case 'ellipsoid': {
            // Quilez's ellipsoid bound: exact on the surface, which is what sampling needs
            const k0 = Math.hypot(x / hx, y / hy, z / hz);
            const k1 = Math.hypot(x / (hx * hx), y / (hy * hy), z / (hz * hz));
            return k1 > 0 ? k0 * (k0 - 1) / k1 : -Math.min(hx, hy, hz);
        }
        case 'cylinder': {
            const radius = (hx + hz) / 2, r = Math.min(round, radius, hy);
            const dx = Math.hypot(x, z) - (radius - r), dy = Math.abs(y) - (hy - r);
            return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - r;
        }
        case 'capsule': {
            const radius = (hx + hz) / 2, half = Math.max(hy - radius, 0);
            const cy = y - Math.max(-half, Math.min(half, y));
            return Math.hypot(x, cy, z) - radius;
        }
        case 'torus': {
            const minor = hy, major = (hx + hz) / 2 - minor;
            return Math.hypot(Math.hypot(x, z) - major, y) - minor;
        }
    }
};

// Build an evaluator over the node list: shapes combine in order, each with
// its own op and smooth radius. Colours blend with the same weights as the
// smooth operators; nodes without a colour keep the colour beneath them.
const createSdf = (nodes: SdfNode[]) => {
    const prepared = nodes.map((node) => {
        const inverse = node.rotation.clone().invert();
        const m = new Mat4().setTRS(Vec3.ZERO, inverse, Vec3.ONE).data;
        // half extents about the node centre; an extrusion's come from its outline
        let hx: number, hy: number, hz: number, yMin: number, yMax: number;
        if (node.shape === 'extrusion') {
            hx = Math.max(...node.profile.map(p => Math.abs(p[0])));
            hy = Math.max(...node.profile.map(p => Math.abs(p[1])));
            hz = node.depth / 2;
            yMin = Math.min(...node.profile.map(p => p[1]));
            yMax = Math.max(...node.profile.map(p => p[1]));
        } else {
            hx = node.size.x / 2; hy = node.size.y / 2; hz = node.size.z / 2;
            yMin = -hy; yMax = hy;
        }
        const [tx, tz] = node.taper ?? [1, 1];
        const grow = Math.max(1, tx, tz);
        return {
            ...node,
            m,
            hx,
            hy,
            hz,
            yMin,
            yMax,
            tx,
            tz,
            tapered: tx !== 1 || tz !== 1,
            mx: node.mirror === 'x',
            my: node.mirror === 'y',
            mz: node.mirror === 'z',
            k: node.smooth ?? 0,
            cx: node.center.x,
            cy: node.center.y,
            cz: node.center.z,
            // bounding radius, enlarged by any taper above 1
            reach: Math.hypot(hx * grow, hy, hz * grow)
        };
    });
    const local = (n: typeof prepared[number], x: number, y: number, z: number) => {
        const px = x - n.cx, py = y - n.cy, pz = z - n.cz, m = n.m;
        let lx = m[0] * px + m[4] * py + m[8] * pz;
        const ly = m[1] * px + m[5] * py + m[9] * pz;
        let lz = m[2] * px + m[6] * py + m[10] * pz;
        if (!n.tapered) return shapeDistance(n.shape, lx, ly, lz, n.hx, n.hy, n.hz, n.round ?? 0, n.profile);
        // taper scales the cross-section with height; the zero set stays exact and
        // the smaller scale keeps the distance a usable bound for projection
        const t = Math.max(0, Math.min(1, (ly - n.yMin) / (n.yMax - n.yMin)));
        const sx = 1 + (n.tx - 1) * t, sz = 1 + (n.tz - 1) * t;
        lx /= sx;
        lz /= sz;
        return shapeDistance(n.shape, lx, ly, lz, n.hx, n.hy, n.hz, n.round ?? 0, n.profile) * Math.min(sx, sz, 1);
    };
    // a mirrored node sees the point folded onto its side of the plane
    const foldX = (n: typeof prepared[number], x: number) => (n.mx ? Math.abs(x) : x);
    const foldY = (n: typeof prepared[number], y: number) => (n.my ? Math.abs(y) : y);
    const foldZ = (n: typeof prepared[number], z: number) => (n.mz ? Math.abs(z) : z);
    // combine d (so far) with b (this node); returns [distance, weight of b]
    const combine = (op: SdfNode['op'], d: number, b: number, k: number): [number, number] => {
        if (op === 'subtract') {
            if (k <= 0) return -b > d ? [-b, 1] : [d, 0];
            const h = Math.max(0, Math.min(1, 0.5 - 0.5 * (d + b) / k));
            return [d + (-b - d) * h + k * h * (1 - h), h];
        }
        if (op === 'intersect') {
            if (k <= 0) return b > d ? [b, 1] : [d, 0];
            const h = Math.max(0, Math.min(1, 0.5 - 0.5 * (d - b) / k));
            return [d + (b - d) * h + k * h * (1 - h), h];
        }
        if (k <= 0) return b < d ? [b, 1] : [d, 0];
        const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (d - b) / k));
        return [d + (b - d) * h - k * h * (1 - h), h];
    };
    const first = prepared[0];
    const distance = (x: number, y: number, z: number) => {
        let d = local(first, foldX(first, x), foldY(first, y), foldZ(first, z));
        for (let i = 1; i < prepared.length; i++) {
            const n = prepared[i];
            const fx = foldX(n, x), fy = foldY(n, y), fz = foldZ(n, z);
            // the distance to a node's bounding sphere is a lower bound on its
            // distance, so skip nodes too far away to change the result: a
            // union needs b < d + k, a subtraction b < k - d
            if (n.op !== 'intersect') {
                const bound = Math.hypot(fx - n.cx, fy - n.cy, fz - n.cz) - n.reach;
                if (bound >= (n.op === 'subtract' ? n.k - d : d + n.k)) continue;
            }
            d = combine(n.op, d, local(n, fx, fy, fz), n.k)[0];
        }
        return d;
    };
    const color = (x: number, y: number, z: number): SdfColor => {
        let d = local(first, foldX(first, x), foldY(first, y), foldZ(first, z));
        const c: SdfColor = [...(first.color ?? [1, 1, 1])];
        for (let i = 1; i < prepared.length; i++) {
            const n = prepared[i];
            const [next, w] = combine(n.op, d, local(n, foldX(n, x), foldY(n, y), foldZ(n, z)), n.k);
            if (n.color) for (let j = 0; j < 3; j++) c[j] += (n.color[j] - c[j]) * w;
            d = next;
        }
        return c;
    };
    // bounds of the shapes that can add surface (subtractions only remove)
    const min = new Vec3(Infinity, Infinity, Infinity), max = new Vec3(-Infinity, -Infinity, -Infinity);
    const r = new Mat4();
    prepared.forEach((n, i) => {
        if (i > 0 && n.op === 'subtract') return;
        r.setTRS(Vec3.ZERO, n.rotation, Vec3.ONE);
        const e = r.data, pad = n.k, gx = n.hx * Math.max(1, n.tx), gz = n.hz * Math.max(1, n.tz);
        const ex = Math.abs(e[0]) * gx + Math.abs(e[4]) * n.hy + Math.abs(e[8]) * gz + pad;
        const ey = Math.abs(e[1]) * gx + Math.abs(e[5]) * n.hy + Math.abs(e[9]) * gz + pad;
        const ez = Math.abs(e[2]) * gx + Math.abs(e[6]) * n.hy + Math.abs(e[10]) * gz + pad;
        // a mirrored node also occupies its reflection
        for (const s of [1, -1]) {
            if (s < 0 && !(n.mx || n.my || n.mz)) continue;
            const cx = n.mx ? s * n.cx : n.cx, cy = n.my ? s * n.cy : n.cy, cz = n.mz ? s * n.cz : n.cz;
            min.set(Math.min(min.x, cx - ex), Math.min(min.y, cy - ey), Math.min(min.z, cz - ez));
            max.set(Math.max(max.x, cx + ex), Math.max(max.y, cy + ey), Math.max(max.z, cz + ez));
        }
    });
    return { distance, color, min, max };
};

// Sample a signed distance field evenly over its surface: estimate the area
// from a pilot pass, draw uniform points in a thin band around the surface,
// project each onto it along the gradient and orient a flat splat to the
// normal. Deterministic, so a repeated call creates the same surface.
const sampleSdf = (spec: SdfSpec): GaussianData => {
    const { count, opacity } = spec;
    const sdf = createSdf(spec.nodes);
    const { min, max } = sdf;
    const extent = new Vec3().sub2(max, min);
    const volume = extent.x * extent.y * extent.z;
    let seed = 0x2545f491;
    const random = () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const draw = (p: Vec3) => p.set(min.x + random() * extent.x, min.y + random() * extent.y, min.z + random() * extent.z);

    // pilot pass: the fraction of the bounds within h0 of the surface gives its area
    const p = new Vec3();
    const pilot = 100000, h0 = 0.01 * extent.length();
    let near = 0;
    for (let i = 0; i < pilot; i++) {
        draw(p);
        if (Math.abs(sdf.distance(p.x, p.y, p.z)) < h0) near++;
    }
    const area = near / pilot * volume / (2 * h0);
    if (!(area > 0)) return { positions: new Float32Array(0), scales: new Float32Array(0), rotations: new Float32Array(0), colors: new Float32Array(0), opacities: new Float32Array(0) };
    const spacing = Math.sqrt(area / count);
    const band = 3 * spacing, e = 0.25 * spacing;
    // random samples clump, so splats cover a full spacing (lattices need 0.7)
    const sigma = spec.splatSize ?? spacing;

    const positions = new Float32Array(count * 3), scales = new Float32Array(count * 3);
    const rotations = new Float32Array(count * 4), colors = new Float32Array(count * 3);
    const n = new Vec3(), q = new Quat();
    let accepted = 0;
    for (let draws = 0, limit = count * 4000; accepted < count && draws < limit; draws++) {
        draw(p);
        let d = sdf.distance(p.x, p.y, p.z);
        if (Math.abs(d) >= band) continue;
        for (let step = 0; step < 2; step++) {
            n.set(
                sdf.distance(p.x + e, p.y, p.z) - sdf.distance(p.x - e, p.y, p.z),
                sdf.distance(p.x, p.y + e, p.z) - sdf.distance(p.x, p.y - e, p.z),
                sdf.distance(p.x, p.y, p.z + e) - sdf.distance(p.x, p.y, p.z - e)
            ).normalize();
            p.x -= n.x * d; p.y -= n.y * d; p.z -= n.z * d;
            d = sdf.distance(p.x, p.y, p.z);
        }
        if (Math.abs(d) > 0.1 * spacing || n.lengthSq() === 0) continue;
        alignZ(n, q);
        positions.set([p.x, p.y, p.z], accepted * 3);
        scales.set([sigma, sigma, sigma * 0.1], accepted * 3);
        rotations.set([q.x, q.y, q.z, q.w], accepted * 4);
        colors.set(sdf.color(p.x, p.y, p.z), accepted * 3);
        accepted++;
    }
    return {
        positions: positions.slice(0, accepted * 3),
        scales: scales.slice(0, accepted * 3),
        rotations: rotations.slice(0, accepted * 4),
        colors: colors.slice(0, accepted * 3),
        opacities: new Float32Array(accepted).fill(opacity)
    };
};

export { samplePrimitives, sampleSdf, toColumns };
export type { GaussianColumn, GaussianData, PrimitiveShape, PrimitiveSpec, SdfNode, SdfShape, SdfSpec };
