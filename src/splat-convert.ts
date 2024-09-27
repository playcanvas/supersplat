import {
    GSplatData,
    Mat3,
    Mat4,
    Quat,
    Vec3
} from 'playcanvas';
import { State } from './splat-state';
import { SHRotation } from './sh-utils';

interface ConvertEntry {
    splatData: GSplatData;
    modelMat: Mat4;
}

const countTotalSplats = (convertData: ConvertEntry[]) => {
    return convertData.reduce((total, entry) => {
        const splatData = entry.splatData;
        const state = splatData.getProp('state') as Uint8Array;
        for (let i = 0; i < splatData.numSplats; ++i) {
            total += (state[i] & State.deleted) === State.deleted ? 0 : 1;
        }
        return total;
    }, 0);
};

const getVertexProperties = (splatData: GSplatData) => {
    return new Set<string>(
        splatData.getElement('vertex')
        .properties.filter((p: any) => p.storage)
        .map((p: any) => p.name)
    );
};

const getCommonPropNames = (convertData: ConvertEntry[]) => {
    let result: Set<string>;

    for (let i = 0; i < convertData.length; ++i) {
        const props = getVertexProperties(convertData[i].splatData);
        result = i == 0 ? props : new Set([...result].filter(i => props.has(i)));
    }

    return [...result];
};

const mat = new Mat4();
const mat3 = new Mat3();
const quat = new Quat();
const scale = new Vec3();
const v = new Vec3();
const q = new Quat();

const convertPly = (convertData: ConvertEntry[]) => {
    // count the number of non-deleted splats
    const totalSplats = countTotalSplats(convertData);

    const internalProps = ['state'];

    // get the vertex properties common to all splats
    const propNames = getCommonPropNames(convertData).filter((p) => !internalProps.includes(p));
    const hasPosition = ['x', 'y', 'z'].every(v => propNames.includes(v));
    const hasRotation = ['rot_0', 'rot_1', 'rot_2', 'rot_3'].every(v => propNames.includes(v));
    const hasScale = ['scale_0', 'scale_1', 'scale_2'].every(v => propNames.includes(v));
    const hasSH = (() => {
        for (let i = 0; i < 45; ++i) {
            if (!propNames.includes(`f_rest_${i}`)) return false;
        }
        return true;
    })();

    const headerText = [
        `ply`,
        `format binary_little_endian 1.0`,
        `element vertex ${totalSplats}`,
         propNames.map(p => `property float ${p}`),
         `end_header`,
         ``
    ].flat().join('\n');

    const header = (new TextEncoder()).encode(headerText);
    const result = new Uint8Array(header.byteLength + totalSplats * propNames.length * 4);
    const dataView = new DataView(result.buffer);

    // construct an object for holding a single splat's properties
    const splat = propNames.reduce((acc: any, name) => {
        acc[name] = 0;
        return acc;
    }, {});

    result.set(header);

    let offset = header.byteLength;

    for (let e = 0; e < convertData.length; ++e) {
        const entry = convertData[e];
        const splatData = entry.splatData;
        const state = splatData.getProp('state') as Uint8Array;
        const storage = propNames.map((name) => splatData.getProp(name));

        // we must undo the transform we apply at load time to output data
        mat.setFromEulerAngles(0, 0, -180);
        mat.mul2(mat, entry.modelMat);
        quat.setFromMat4(mat);
        mat.getScale(scale);

        let shRot;
        let shData;
        let shCoeffs: number[];
        if (hasSH) {
            mat3.setFromQuat(quat);

            // initialize sh rotation helper
            shRot = new SHRotation(mat3);

            // get sh coefficients
            shData = [];
            for (let i = 0; i < 45; ++i) {
                shData.push(splatData.getProp(`f_rest_${i}`));
            }

            shCoeffs = [0];
        }

        for (let i = 0; i < splatData.numSplats; ++i) {
            if ((state[i] & State.deleted) === State.deleted) continue;

            // read splat data
            for (let j = 0; j < propNames.length; ++j) {
                splat[propNames[j]] = storage[j][i];
            }

            // transform
            if (hasPosition) {
                v.set(splat.x, splat.y, splat.z);
                mat.transformPoint(v, v);
                [splat.x, splat.y, splat.z] = [v.x, v.y, v.z];
            }

            if (hasRotation) {
                q.set(splat.rot_1, splat.rot_2, splat.rot_3, splat.rot_0).mul2(quat, q);
                [splat.rot_1, splat.rot_2, splat.rot_3, splat.rot_0] = [q.x, q.y, q.z, q.w];
            }

            if (hasScale) {
                splat.scale_0 = Math.log(Math.exp(splat.scale_0) * scale.x);
                splat.scale_1 = Math.log(Math.exp(splat.scale_1) * scale.y);
                splat.scale_2 = Math.log(Math.exp(splat.scale_2) * scale.z);
            }

            if (hasSH) {
                for (let c = 0; c < 3; ++c) {
                    for (let d = 0; d < 15; ++d) {
                        shCoeffs[d + 1] = shData[c * 15 + d][i];
                    }

                    shRot.apply(shCoeffs, shCoeffs);

                    for (let d = 0; d < 15; ++d) {
                        splat[`f_rest_${c * 15 + d}`] = shCoeffs[d + 1];
                    }
                }
            }

            // write
            for (let j = 0; j < propNames.length; ++j) {
                dataView.setFloat32(offset, splat[propNames[j]], true);
                offset += 4;
            }
        }
    }

    return result;
};

interface CompressedIndex {
    entry: ConvertEntry;
    entryIndex: number;
    i: number;
    globalIndex: number;
}

class SingleSplat {
    x = 0;
    y = 0;
    z = 0;
    scale_0 = 0;
    scale_1 = 0;
    scale_2 = 0;
    f_dc_0 = 0;
    f_dc_1 = 0;
    f_dc_2 = 0;
    opacity = 0;
    rot_0 = 0;
    rot_1 = 0;
    rot_2 = 0;
    rot_3 = 0;

    read(index: CompressedIndex) {
        const val = (prop: string) => index.entry.splatData.getProp(prop)[index.i];
        [this.x, this.y, this.z] = [val('x'), val('y'), val('z')];
        [this.scale_0, this.scale_1, this.scale_2] = [val('scale_0'), val('scale_1'), val('scale_2')];
        [this.f_dc_0, this.f_dc_1, this.f_dc_2, this.opacity] = [val('f_dc_0'), val('f_dc_1'), val('f_dc_2'), val('opacity')];
        [this.rot_0, this.rot_1, this.rot_2, this.rot_3] = [val('rot_0'), val('rot_1'), val('rot_2'), val('rot_3')];
    }

    transform(mat: Mat4, quat: Quat, scale: Vec3) {
        // position
        v.set(this.x, this.y, this.z);
        mat.transformPoint(v, v);
        [this.x, this.y, this.z] = [v.x, v.y, v.z];

        // rotation
        q.set(this.rot_1, this.rot_2, this.rot_3, this.rot_0).mul2(quat, q);
        [this.rot_1, this.rot_2, this.rot_3, this.rot_0] = [q.x, q.y, q.z, q.w];

        // scale
        this.scale_0 = Math.log(Math.exp(this.scale_0) * scale.x);
        this.scale_1 = Math.log(Math.exp(this.scale_1) * scale.y);
        this.scale_2 = Math.log(Math.exp(this.scale_2) * scale.z);
    }
}

const compressedVal = (prop: string, index: CompressedIndex) => {
    return index.entry.splatData.getProp(prop)[index.i];
};

const compressedMinMax = (prop: string, indices: CompressedIndex[]) => {
    let min, max;
    min = max = compressedVal(prop, indices[0]);
    for (let i = 1; i < indices.length; ++i) {
        const v = compressedVal(prop, indices[i]);
        min = Math.min(min, v);
        max = Math.max(max, v);
    }
    return { min, max };
};

const normalize = (x: number, min: number, max: number) => {
    return (max - min < 0.00001) ? 0 : (x - min) / (max - min);
};

// process and compress a chunk of 256 splats
class Chunk {
    static members = [
        'x', 'y', 'z',
        'scale_0', 'scale_1', 'scale_2',
        'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity',
        'rot_0', 'rot_1', 'rot_2', 'rot_3'
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

    set(index: number, splat: SingleSplat) {
        Chunk.members.forEach((name) => {
            this.data[name][index] = (splat as any)[name];
        });
    }

    pack() {
        const calcMinMax = (data: Float32Array) => {
            let min;
            let max;
            min = max = data[0];
            for (let i = 1; i < data.length; ++i) {
                const v = data[i];
                min = Math.min(min, v);
                max = Math.max(max, v);
            }
            return { min, max };
        };

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

// sort the compressed indices into morton order
const sortSplats = (indices: CompressedIndex[]) => {
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

    const bx = compressedMinMax('x', indices);
    const by = compressedMinMax('y', indices);
    const bz = compressedMinMax('z', indices);

    const xlen = bx.max - bx.min;
    const ylen = by.max - by.min;
    const zlen = bz.max - bz.min;

    // generate morton codes
    const morton = indices.map((i) => {
        const ix = Math.floor(1024 * (compressedVal('x', i) - bx.min) / xlen);
        const iy = Math.floor(1024 * (compressedVal('y', i) - by.min) / ylen);
        const iz = Math.floor(1024 * (compressedVal('z', i) - bz.min) / zlen);
        return encodeMorton3(ix, iy, iz);
    });

    // order splats by morton code
    indices.sort((a, b) => morton[a.globalIndex] - morton[b.globalIndex]);
};

const convertPlyCompressed = (convertData: ConvertEntry[]) => {
    const chunkProps = [
        'min_x', 'min_y', 'min_z',
        'max_x', 'max_y', 'max_z',
        'min_scale_x', 'min_scale_y',
        'min_scale_z', 'max_scale_x',
        'max_scale_y', 'max_scale_z'
    ];

    const vertexProps = [
        'packed_position',
        'packed_rotation',
        'packed_scale',
        'packed_color'
    ];

    // create a list of indices spanning all splats
    const indices: CompressedIndex[] = convertData.reduce((indices, entry, entryIndex) => {
        const splatData = entry.splatData;
        const state = splatData.getProp('state') as Uint8Array;
        for (let i = 0; i < splatData.numSplats; ++i) {
            if ((state[i] & State.deleted) === 0) {
                indices.push({
                    entry,
                    entryIndex,
                    i,
                    globali: indices.length
                });
            }
        }
        return indices;
    }, []);

    if (indices.length === 0) {
        console.error('nothing to export');
        return;
    }

    const numSplats = indices.length;
    const numChunks = Math.ceil(numSplats / 256);

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

    // sort splats into some kind of order
    sortSplats(indices);

    // generate transforms for each splat model
    const transforms = convertData.map((entry) => {
        return {
            modelMat: entry.modelMat.clone(),
            quat: new Quat().setFromMat4(entry.modelMat),
            scale: entry.modelMat.getScale()
        };
    });

    const chunk = new Chunk();
    const singleSplat = new SingleSplat();

    for (let i = 0; i < numChunks; ++i) {
        const num = Math.min(numSplats, (i + 1) * 256) - i * 256;
        for (let j = 0; j < num; ++j) {
            const index = indices[i * 256 + j];

            // read splat
            singleSplat.read(index);

            // transform
            const t = transforms[index.entryIndex];
            singleSplat.transform(t.modelMat, t.quat, t.scale);

            // set
            chunk.set(j, singleSplat);
        }

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
        const offset = vertexOffset + i * 256 * 4 * 4;
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

const convertSplat = (convertData: ConvertEntry[]) => {
    const totalSplats = countTotalSplats(convertData);

    // position.xyz: float32, scale.xyz: float32, color.rgba: uint8, quaternion.ijkl: uint8
    const result = new Uint8Array(totalSplats * 32);
    const dataView = new DataView(result.buffer);

    let idx = 0;

    for (let e = 0; e < convertData.length; ++e) {
        const entry = convertData[e];
        const splatData = entry.splatData;

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

        // we must undo the transform we apply at load time to output data
        mat.setScale(-1, -1, 1);
        mat.invert();
        mat.mul2(mat, entry.modelMat);
        quat.setFromMat4(mat);
        mat.getScale(scale);

        const clamp = (x: number) => Math.max(0, Math.min(255, x));

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
    }

    return result;
};

export { convertPly, convertPlyCompressed, convertSplat };
