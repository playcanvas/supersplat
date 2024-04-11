import {
    GSplatData,
    Mat4,
    Quat,
    Vec3
} from 'playcanvas';
import { State } from './edit-ops';

const convertPly = (splatData: GSplatData, modelMat: Mat4) => {
    // count the number of non-deleted splats
    const state = splatData.getProp('state') as Uint8Array;
    let numSplats = 0;
    for (let i = 0; i < splatData.numSplats; ++i) {
        numSplats += (state[i] & State.deleted) === State.deleted ? 0 : 1;
    }

    const internalProps = ['state'];
    const props = splatData.vertexElement.properties.filter((p: any) => p.storage && !internalProps.includes(p.name));
    const header = (new TextEncoder()).encode(`ply\nformat binary_little_endian 1.0\nelement vertex ${numSplats}\n` + props.map((p: any) => `property float ${p.name}`).join('\n') + `\nend_header\n`);
    const result = new Uint8Array(header.byteLength + numSplats * props.length * 4);

    result.set(header);

    const dataView = new DataView(result.buffer);
    let offset = header.byteLength;

    for (let i = 0; i < splatData.numSplats; ++i) {
        if ((state[i] & State.deleted) === State.deleted) continue;
        props.forEach((prop: any) => {
            dataView.setFloat32(offset, prop.storage[i], true);
            offset += 4;
        });
    }

    // FIXME
    // we must undo the transform we apply at load time to output data
    const mat = new Mat4();
    mat.setScale(-1, -1, 1);
    mat.invert();
    mat.mul2(mat, modelMat);

    const quat = new Quat();
    quat.setFromMat4(mat);

    const scale = new Vec3();
    mat.getScale(scale);

    const v = new Vec3();
    const q = new Quat();

    const propIndex = (name: string) => props.findIndex((p: any) => p.name === name);
    const x_off = propIndex('x') * 4;
    const y_off = propIndex('y') * 4;
    const z_off = propIndex('z') * 4;
    const r0_off = propIndex('rot_0') * 4;
    const r1_off = propIndex('rot_1') * 4;
    const r2_off = propIndex('rot_2') * 4;
    const r3_off = propIndex('rot_3') * 4;
    const scale0_off = propIndex('scale_0') * 4;
    const scale1_off = propIndex('scale_1') * 4;
    const scale2_off = propIndex('scale_2') * 4;

    for (let i = 0; i < numSplats; ++i) {
        const off = header.byteLength + i * props.length * 4;
        const x = dataView.getFloat32(off + x_off, true);
        const y = dataView.getFloat32(off + y_off, true);
        const z = dataView.getFloat32(off + z_off, true);
        const rot_0 = dataView.getFloat32(off + r0_off, true);
        const rot_1 = dataView.getFloat32(off + r1_off, true);
        const rot_2 = dataView.getFloat32(off + r2_off, true);
        const rot_3 = dataView.getFloat32(off + r3_off, true);
        const scale_0 = dataView.getFloat32(off + scale0_off, true);
        const scale_1 = dataView.getFloat32(off + scale1_off, true);
        const scale_2 = dataView.getFloat32(off + scale2_off, true);

        v.set(x, y, z);
        mat.transformPoint(v, v);
        dataView.setFloat32(off + x_off, v.x, true);
        dataView.setFloat32(off + y_off, v.y, true);
        dataView.setFloat32(off + z_off, v.z, true);

        q.set(rot_1, rot_2, rot_3, rot_0).mul2(quat, q);
        dataView.setFloat32(off + r0_off, q.w, true);
        dataView.setFloat32(off + r1_off, q.x, true);
        dataView.setFloat32(off + r2_off, q.y, true);
        dataView.setFloat32(off + r3_off, q.z, true);

        dataView.setFloat32(off + scale0_off, Math.log(Math.exp(scale_0) * scale.x), true);
        dataView.setFloat32(off + scale1_off, Math.log(Math.exp(scale_1) * scale.x), true);
        dataView.setFloat32(off + scale2_off, Math.log(Math.exp(scale_2) * scale.x), true);
    }

    return result;
};

const calcMinMax = (data: Float32Array, indices?: number[]) => {
    let min;
    let max;
    if (indices) {
        min = max = data[indices[0]];
        for (let i = 1; i < indices.length; ++i) {
            const v = data[indices[i]];
            min = Math.min(min, v);
            max = Math.max(max, v);
        }
    } else {
        min = max = data[0];
        for (let i = 1; i < data.length; ++i) {
            const v = data[i];
            min = Math.min(min, v);
            max = Math.max(max, v);
        }
    }
    return { min, max };
};

const normalize = (x: number, min: number, max: number) => {
    return (max - min < 0.00001) ? 0 : (x - min) / (max - min);
};

const quat = new Quat();
const scale = new Vec3();
const v = new Vec3();
const q = new Quat();

// process and compress a chunk of 256 splats
class Chunk {
    static members = [
        'x', 'y', 'z', 'scale_0', 'scale_1', 'scale_2', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity', 'rot_0', 'rot_1', 'rot_2', 'rot_3'
    ];

    size: number;
    data: any = {};

    // compressed data
    position: Uint32Array;
    rotation: Uint32Array;
    scale: Uint32Array;
    color: Uint32Array;

    constructor(size = 256) {
        this.size = size;
        Chunk.members.forEach((m) => {
            this.data[m] = new Float32Array(size);
        });
        this.position = new Uint32Array(size);
        this.rotation = new Uint32Array(size);
        this.scale = new Uint32Array(size);
        this.color = new Uint32Array(size);
    }

    set(splatData: GSplatData, indices: number[]) {
        Chunk.members.forEach((name) => {
            const prop = splatData.getProp(name);
            const m = this.data[name];
            indices.forEach((idx, i) => {
                m[i] = prop[idx];
            });
        });
    }

    transform(mat: Mat4) {
        quat.setFromMat4(mat);
        mat.getScale(scale);

        const data = this.data;

        const x = data.x;
        const y = data.y;
        const z = data.z;
        const scale_0 = data.scale_0;
        const scale_1 = data.scale_1;
        const scale_2 = data.scale_2;
        const rot_0 = data.rot_0;
        const rot_1 = data.rot_1;
        const rot_2 = data.rot_2;
        const rot_3 = data.rot_3;

        for (let i = 0; i < this.size; ++i) {
            // position
            v.set(x[i], y[i], z[i]);
            mat.transformPoint(v, v);
            x[i] = v.x;
            y[i] = v.y;
            z[i] = v.z;

            // rotation
            q.set(rot_1[i], rot_2[i], rot_3[i], rot_0[i]).mul2(quat, q);
            rot_0[i] = q.w;
            rot_1[i] = q.x;
            rot_2[i] = q.y;
            rot_3[i] = q.z;

            // scale
            scale_0[i] = Math.log(Math.exp(scale_0[i]) * scale.x);
            scale_1[i] = Math.log(Math.exp(scale_1[i]) * scale.y);
            scale_2[i] = Math.log(Math.exp(scale_2[i]) * scale.z);
        }
    }

    pack() {
        const data = this.data;

        const x = data.x;
        const y = data.y;
        const z = data.z;
        const scale_0 = data.scale_0;
        const scale_1 = data.scale_1;
        const scale_2 = data.scale_2;
        const rot_0 = data.rot_0;
        const rot_1 = data.rot_1;
        const rot_2 = data.rot_2;
        const rot_3 = data.rot_3;
        const f_dc_0 = data.f_dc_0;
        const f_dc_1 = data.f_dc_1;
        const f_dc_2 = data.f_dc_2;
        const opacity = data.opacity;

        const px = calcMinMax(x);
        const py = calcMinMax(y);
        const pz = calcMinMax(z);

        const sx = calcMinMax(scale_0);
        const sy = calcMinMax(scale_1);
        const sz = calcMinMax(scale_2);

        const packUnorm = (value: number, bits: number) => {
            const t = (1 << bits) - 1;
            return Math.max(0, Math.min(t, Math.floor(value * t + 0.5)));
        };

        const pack111011 = (x: number, y: number, z: number) => {
            return packUnorm(x, 11) << 21 |
                   packUnorm(y, 10) << 11 |
                   packUnorm(z, 11);
        };

        const pack8888 = (x: number, y: number, z: number, w: number) => {
            return packUnorm(x, 8) << 24 |
                   packUnorm(y, 8) << 16 |
                   packUnorm(z, 8) << 8 |
                   packUnorm(w, 8);
        };

        // pack quaternion into 2,10,10,10
        const packRot = (x: number, y: number, z: number, w: number) => {
            q.set(x, y, z, w).normalize();
            const a = [q.x, q.y, q.z, q.w];
            const largest = a.reduce((curr, v, i) => Math.abs(v) > Math.abs(a[curr]) ? i : curr, 0);

            if (a[largest] < 0) {
                a[0] = -a[0];
                a[1] = -a[1];
                a[2] = -a[2];
                a[3] = -a[3];
            }

            const norm = Math.sqrt(2) * 0.5;
            let result = largest;
            for (let i = 0; i < 4; ++i) {
                if (i !== largest) {
                    result = (result << 10) | packUnorm(a[i] * norm + 0.5, 10);
                }
            }

            return result;
        };

        const packColor = (r: number, g: number, b: number, a: number) => {
            const SH_C0 = 0.28209479177387814;
            return pack8888(
                r * SH_C0 + 0.5,
                g * SH_C0 + 0.5,
                b * SH_C0 + 0.5,
                1 / (1 + Math.exp(-a))
            );
        };

        // pack
        for (let i = 0; i < this.size; ++i) {
            this.position[i] = pack111011(
                normalize(x[i], px.min, px.max),
                normalize(y[i], py.min, py.max),
                normalize(z[i], pz.min, pz.max)
            );

            this.rotation[i] = packRot(rot_0[i], rot_1[i], rot_2[i], rot_3[i]);

            this.scale[i] = pack111011(
                normalize(scale_0[i], sx.min, sx.max),
                normalize(scale_1[i], sy.min, sy.max),
                normalize(scale_2[i], sz.min, sz.max)
            );

            this.color[i] = packColor(f_dc_0[i], f_dc_1[i], f_dc_2[i], opacity[i]);
        }

        return { px, py, pz, sx, sy, sz };
    }
}

const convertPlyCompressed = (splatData: GSplatData, modelMat: Mat4) => {
    const sortSplats = (indices: number[]) => {
        // https://fgiesen.wordpress.com/2009/12/13/decoding-morton-codes/
        const encodeMorton3 = (x: number, y: number, z: number) : number => {
            const Part1By2 = (x: number) => {
                x &= 0x000003ff;
                x = (x ^ (x << 16)) & 0xff0000ff;
                x = (x ^ (x <<  8)) & 0x0300f00f;
                x = (x ^ (x <<  4)) & 0x030c30c3;
                x = (x ^ (x <<  2)) & 0x09249249;
                return x;
            };

            return (Part1By2(z) << 2) + (Part1By2(y) << 1) + Part1By2(x);
        };

        const x = splatData.getProp('x') as Float32Array;
        const y = splatData.getProp('y') as Float32Array;
        const z = splatData.getProp('z') as Float32Array;

        const bx = calcMinMax(x, indices);
        const by = calcMinMax(y, indices);
        const bz = calcMinMax(z, indices);

        // generate morton codes
        const morton = indices.map((i) => {
            const ix = Math.floor(1024 * (x[i] - bx.min) / (bx.max - bx.min));
            const iy = Math.floor(1024 * (y[i] - by.min) / (by.max - by.min));
            const iz = Math.floor(1024 * (z[i] - bz.min) / (bz.max - bz.min));
            return encodeMorton3(ix, iy, iz);
        });

        // order splats by morton code
        indices.sort((a, b) => morton[a] - morton[b]);
    };

    // generate index list of surviving splats
    const state = splatData.getProp('state') as Uint8Array;
    const indices = [];
    for (let i = 0; i < splatData.numSplats; ++i) {
        if ((state[i] & State.deleted) === 0) {
            indices.push(i);
        }
    }

    if (indices.length === 0) {
        console.error('nothing to export');
        return;
    }

    const numSplats = indices.length;
    const numChunks = Math.ceil(numSplats / 256);

    const chunkProps = ['min_x', 'min_y', 'min_z', 'max_x', 'max_y', 'max_z', 'min_scale_x', 'min_scale_y', 'min_scale_z', 'max_scale_x', 'max_scale_y', 'max_scale_z'];
    const vertexProps = ['packed_position', 'packed_rotation', 'packed_scale', 'packed_color'];
    const headerText = [
        [
            `ply`,
            `format binary_little_endian 1.0`,
            `comment generated by super-splat`,
            `element chunk ${numChunks}`
        ],
        chunkProps.map(p => `property float ${p}`),
        [
            `element vertex ${numSplats}`
        ],
        vertexProps.map(p => `property uint ${p}`),
        [
            `end_header\n`
        ]
    ].flat().join('\n');

    const header = (new TextEncoder()).encode(headerText);
    const result = new Uint8Array(header.byteLength + numChunks * chunkProps.length * 4 + numSplats * vertexProps.length * 4);
    const dataView = new DataView(result.buffer);

    result.set(header);

    const chunkOffset = header.byteLength;
    const vertexOffset = chunkOffset + numChunks * 12 * 4;

    const chunk = new Chunk();

    // sort splats into some kind of order
    sortSplats(indices);

    for (let i = 0; i < numChunks; ++i) {
        chunk.set(splatData, indices.slice(i * 256, (i + 1) * 256));
        chunk.transform(modelMat);

        const result = chunk.pack();

        // write chunk data
        dataView.setFloat32(chunkOffset + i * 12 * 4 + 0, result.px.min, true);
        dataView.setFloat32(chunkOffset + i * 12 * 4 + 4, result.py.min, true);
        dataView.setFloat32(chunkOffset + i * 12 * 4 + 8, result.pz.min, true);
        dataView.setFloat32(chunkOffset + i * 12 * 4 + 12, result.px.max, true);
        dataView.setFloat32(chunkOffset + i * 12 * 4 + 16, result.py.max, true);
        dataView.setFloat32(chunkOffset + i * 12 * 4 + 20, result.pz.max, true);

        dataView.setFloat32(chunkOffset + i * 12 * 4 + 24, result.sx.min, true);
        dataView.setFloat32(chunkOffset + i * 12 * 4 + 28, result.sy.min, true);
        dataView.setFloat32(chunkOffset + i * 12 * 4 + 32, result.sz.min, true);
        dataView.setFloat32(chunkOffset + i * 12 * 4 + 36, result.sx.max, true);
        dataView.setFloat32(chunkOffset + i * 12 * 4 + 40, result.sy.max, true);
        dataView.setFloat32(chunkOffset + i * 12 * 4 + 44, result.sz.max, true);

        // write splat data
        let offset = vertexOffset + i * 256 * 4 * 4;
        const chunkSplats = Math.min(numSplats, (i + 1) * 256) - i * 256;
        for (let j = 0; j < chunkSplats; ++j) {
            dataView.setUint32(offset + j * 4 * 4 + 0, chunk.position[j], true);
            dataView.setUint32(offset + j * 4 * 4 + 4, chunk.rotation[j], true);
            dataView.setUint32(offset + j * 4 * 4 + 8, chunk.scale[j], true);
            dataView.setUint32(offset + j * 4 * 4 + 12, chunk.color[j], true);
        }
    }

    return result;
};

const convertSplat = (splatData: GSplatData, modelMat: Mat4) => {
    // count the number of non-deleted splats
    const x = splatData.getProp('x');
    const y = splatData.getProp('y');
    const z = splatData.getProp('z');
    const opacity = splatData.getProp('opacity');
    const rot_0 = splatData.getProp('rot_0');
    const rot_1 = splatData.getProp('rot_1');
    const rot_2 = splatData.getProp('rot_2');
    const rot_3 = splatData.getProp('rot_3');
    const f_dc_0 = splatData.getProp('f_dc_0');
    const f_dc_1 = splatData.getProp('f_dc_1');
    const f_dc_2 = splatData.getProp('f_dc_2');
    const scale_0 = splatData.getProp('scale_0');
    const scale_1 = splatData.getProp('scale_1');
    const scale_2 = splatData.getProp('scale_2');

    const state = splatData.getProp('state') as Uint8Array;

    // count number of non-deleted splats
    let numSplats = 0;
    for (let i = 0; i < splatData.numSplats; ++i) {
        numSplats += (state[i] & State.deleted) === State.deleted ? 0 : 1;
    }

    // position.xyz: float32, scale.xyz: float32, color.rgba: uint8, quaternion.ijkl: uint8
    const result = new Uint8Array(numSplats * 32);
    const dataView = new DataView(result.buffer);

    // we must undo the transform we apply at load time to output data
    const mat = new Mat4();
    mat.setScale(-1, -1, 1);
    mat.invert();
    mat.mul2(mat, modelMat);

    const quat = new Quat();
    quat.setFromMat4(mat);

    const v = new Vec3();
    const q = new Quat();

    const scale = new Vec3();
    mat.getScale(scale);

    const clamp = (x: number) => Math.max(0, Math.min(255, x));
    let idx = 0;

    for (let i = 0; i < splatData.numSplats; ++i) {
        if ((state[i] & State.deleted) === State.deleted) continue;

        const off = idx++ * 32;

        v.set(x[i], y[i], z[i]);
        mat.transformPoint(v, v);
        dataView.setFloat32(off + 0, v.x, true);
        dataView.setFloat32(off + 4, v.y, true);
        dataView.setFloat32(off + 8, v.z, true);

        dataView.setFloat32(off + 12, Math.exp(scale_0[i]) * scale.x, true);
        dataView.setFloat32(off + 16, Math.exp(scale_1[i]) * scale.x, true);
        dataView.setFloat32(off + 20, Math.exp(scale_2[i]) * scale.x, true);

        const SH_C0 = 0.28209479177387814;
        dataView.setUint8(off + 24, clamp((0.5 + SH_C0 * f_dc_0[i]) * 255));
        dataView.setUint8(off + 25, clamp((0.5 + SH_C0 * f_dc_1[i]) * 255));
        dataView.setUint8(off + 26, clamp((0.5 + SH_C0 * f_dc_2[i]) * 255));
        dataView.setUint8(off + 27, clamp((1 / (1 + Math.exp(-opacity[i]))) * 255));

        q.set(rot_1[i], rot_2[i], rot_3[i], rot_0[i]).mul2(quat, q).normalize();
        dataView.setUint8(off + 28, clamp(q.w * 128 + 128));
        dataView.setUint8(off + 29, clamp(q.x * 128 + 128));
        dataView.setUint8(off + 30, clamp(q.y * 128 + 128));
        dataView.setUint8(off + 31, clamp(q.z * 128 + 128));
    }

    return result;
};

export { convertPly, convertPlyCompressed, convertSplat };
