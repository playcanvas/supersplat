import { Quat, Vec3 } from 'playcanvas';

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
            for (let j = 0; j < partCount; j++, i++) {
                parts[index].sample(frac(0.5 + R2[0] * j), frac(0.5 + R2[1] * j), p, n);
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

export { samplePrimitives, toColumns };
export type { GaussianColumn, GaussianData, PrimitiveShape, PrimitiveSpec };
