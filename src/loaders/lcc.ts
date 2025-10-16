// SHENZHEN XGRIDS-INNOVATION CO., LTD
// This file is part of the XGRIDS Lixel CyberColor (LCC) product.
// For more information, please visit: https://xgrids.com/

import { GSplatData, Vec3 } from 'playcanvas';

import { ModelLoadRequest } from './model-load-request';

// The LCC_LOD_MAX_SPLATS can be adjusted according to the situation
const LCC_LOD_MAX_SPLATS = 20_000_000;
const kSH_C0 = 0.28209479177387814;
const SQRT_2 = 1.414213562373095;
const SQRT_2_INV = 0.7071067811865475;

// lod data in data.bin
interface LccLod{
    points: number;     // number of splats
    offset: bigint;     // offset
    size: number;       // data size
}

// The scene uses a quadtree for spatial partitioning,
// with each unit having its own xy index (starting from 0) and multiple layers of lod data
interface LccUnitInfo {
    x: number;          // x index
    y: number;          // y index
    lods: Array<LccLod>;    //  lods
}

// Used to decompress scale in data.bin and sh in shcoef.bin
interface CompressInfo {
    compressedScaleMin: Vec3;   // min scale
    compressedScaleMax: Vec3;   // max scale
    compressedSHMin: Vec3;      // min sh
    compressedSHMax: Vec3;      // max sh
}

// parameters used to convert LCC data into GSplatData
interface LccParam{
    totalSplats: number;
    targetLod: number;
    isHasSH: boolean;
    compressInfo: CompressInfo;
    unitInfos: Array<LccUnitInfo>;
    dataFileContent: File;
    shFileContent?: File;
}

interface ProcessUnitContext {
  info: LccUnitInfo;
  targetLod: number;
  isHasSH: boolean;
  dataFileContent: Blob;
  shFileContent: Blob;
  compressInfo: CompressInfo;
  propertyOffset: number;
  properties: Record<string, Float32Array>;
  properties_f_rest: Float32Array[] | null;
}

// parse .lcc files, such as meta.lcc
const parseMeta = (obj: any) : CompressInfo => {
    const attributes: { [key: string]: any } = {};
    obj.attributes.forEach((attr: any) => {
        attributes[attr.name] = attr;
    });
    const scaleMin = attributes.scale.min;
    const scaleMax = attributes.scale.max;
    const shMin = attributes.shcoef.min;
    const shMax = attributes.shcoef.max;

    const compressInfo:CompressInfo = {
        compressedScaleMin: new Vec3(scaleMin[0], scaleMin[1], scaleMin[2]),
        compressedScaleMax: new Vec3(scaleMax[0], scaleMax[1], scaleMax[2]),
        compressedSHMin: new Vec3(shMin[0], shMin[1], shMin[2]),
        compressedSHMax: new Vec3(shMax[0], shMax[1], shMax[2])
    };

    return compressInfo;
};

const parseIndexBin = (raw: ArrayBuffer, meta:any): Array<LccUnitInfo> => {
    let offset = 0;

    const buff = new DataView(raw);
    const infos: Array<LccUnitInfo> = [];
    while (true) {
        if (offset > buff.byteLength - 1) {
            break;
        }

        const x = buff.getInt16(offset, true);
        offset += 2;
        const y = buff.getInt16(offset, true);
        offset += 2;

        const lods:Array<LccLod> = [];
        for (let i = 0; i < meta.totalLevel; i++) {
            const ldPoints = buff.getInt32(offset, true);
            offset += 4;

            const ldOffset = buff.getBigInt64(offset, true);
            offset += 8;

            const ldSize = buff.getInt32(offset, true);
            offset += 4;

            lods.push({
                points: ldPoints,
                offset: ldOffset,
                size: ldSize
            });

        }
        const info:LccUnitInfo = {
            x,
            y,
            lods
        };

        infos.push(info);
    }

    return infos;
};

const InvSigmoid = (v: number): number => {
    return -Math.log((1.0 - v) / v);
};

const InvSH0ToColor = (v: number): number => {
    return (v - 0.5) / kSH_C0;
};

const InvLinearScale = (v: number): number => {
    return Math.log(v);
};

const mix = (min: number, max: number, s: number): number => {
    return (1.0 - s) * min + s * max;
};

const mixVec3 = (min:Vec3, max:Vec3, v:Vec3):Vec3 => {
    return new Vec3(
        mix(min.x, max.x, v.x),
        mix(min.y, max.y, v.y),
        mix(min.z, max.z, v.z)
    );
};

const DecodePacked_11_10_11 = (enc: number): Vec3 => {
    return new Vec3(
        (enc & 0x7FF) / 2047.0,
        ((enc >> 11) & 0x3FF) / 1023.0,
        ((enc >> 21) & 0x7FF) / 2047.0);
};

const decodeRotation = (v:number) => {
    const d0 = (v & 1023) / 1023.0;
    const d1 = ((v >> 10) & 1023) / 1023.0;
    const d2 = ((v >> 20) & 1023) / 1023.0;
    const d3 = (v >> 30) & 3;

    const qx = d0 * SQRT_2 - SQRT_2_INV;
    const qy = d1 * SQRT_2 - SQRT_2_INV;
    const qz = d2 * SQRT_2 - SQRT_2_INV;
    let sum = qx * qx + qy * qy + qz * qz;
    sum = Math.min(1.0, sum);
    const qw = Math.sqrt(1 - sum);

    if (d3 === 0) {
        return [qw, qx, qy, qz];
    } else if (d3 === 1) {
        return [qx, qw, qy, qz];
    } else if (d3 === 2) {
        return [qx, qy, qw, qz];
    }
    return [qx, qy, qz, qw];

};

const floatProps = [
    'x', 'y', 'z',
    'nx', 'ny', 'nz',
    'opacity',
    'rot_0', 'rot_1', 'rot_2', 'rot_3',
    'f_dc_0', 'f_dc_1', 'f_dc_2',
    'scale_0', 'scale_1', 'scale_2'
];

const createStorage = (length: number) => new Float32Array(length);

const initProperties = (length: number): Record<string, Float32Array> => {
    const props: Record<string, Float32Array> = {};
    for (const key of floatProps) {
        props[`property_${key}`] = createStorage(length);
    }
    return props;
};

const decodeSplat = (
    dataView: DataView,
    shDataView: DataView | null,
    i: number,
    compressInfo: CompressInfo,
    unitProperties: Record<string, Float32Array>,
    unitProperties_f_rest: Float32Array[] | null,
    isHasSH: boolean
) => {
    const off = i * 32;

    // position
    unitProperties.property_x[i] = dataView.getFloat32(off + 0, true);
    unitProperties.property_y[i] = dataView.getFloat32(off + 4, true);
    unitProperties.property_z[i] = dataView.getFloat32(off + 8, true);

    // decode color
    unitProperties.property_f_dc_0[i] = InvSH0ToColor(dataView.getUint8(off + 12) / 255.0);
    unitProperties.property_f_dc_1[i] = InvSH0ToColor(dataView.getUint8(off + 13) / 255.0);
    unitProperties.property_f_dc_2[i] = InvSH0ToColor(dataView.getUint8(off + 14) / 255.0);
    unitProperties.property_opacity[i] = InvSigmoid(dataView.getUint8(off + 15) / 255.0);

    // decode scale
    const scaleMin:Vec3 = compressInfo.compressedScaleMin;
    const scaleMax:Vec3 = compressInfo.compressedScaleMax;
    unitProperties.property_scale_0[i] = InvLinearScale(mix(scaleMin.x, scaleMax.x, dataView.getUint16(off + 16, true) / 65535.0));
    unitProperties.property_scale_1[i] = InvLinearScale(mix(scaleMin.y, scaleMax.y, dataView.getUint16(off + 18, true) / 65535.0));
    unitProperties.property_scale_2[i] = InvLinearScale(mix(scaleMin.z, scaleMax.z, dataView.getUint16(off + 20, true) / 65535.0));

    // decode rotation
    const q = decodeRotation(dataView.getUint32(off + 22, true));
    unitProperties.property_rot_0[i] = q[3];// w
    unitProperties.property_rot_1[i] = q[0];// x
    unitProperties.property_rot_2[i] = q[1];// y
    unitProperties.property_rot_3[i] = q[2];// z

    // normal
    unitProperties.property_nx[i] = dataView.getUint16(off + 26, true);
    unitProperties.property_ny[i] = dataView.getUint16(off + 28, true);
    unitProperties.property_nz[i] = dataView.getUint16(off + 30, true);

    // SH
    if (isHasSH && shDataView && unitProperties_f_rest) {
        const shOff = off * 2;
        const SHValues = Array.from({ length: 15 }, (_, idx) => shDataView.getUint32(shOff + idx * 4, true));
        const { compressedSHMin, compressedSHMax } = compressInfo;
        const vecSHValues = SHValues.map(sh => mixVec3(compressedSHMin, compressedSHMax, DecodePacked_11_10_11(sh)));

        for (let j = 0; j < 15; j++) {
            unitProperties_f_rest[j][i] = vecSHValues[j].x;
            unitProperties_f_rest[j + 15][i] = vecSHValues[j].y;
            unitProperties_f_rest[j + 30][i] = vecSHValues[j].z;
        }
    }
};

const processUnit = async (ctx: ProcessUnitContext): Promise<number> => {
    const {
        info,
        targetLod,
        isHasSH,
        dataFileContent,
        shFileContent,
        compressInfo,
        propertyOffset,
        properties,
        properties_f_rest
    } = ctx;

    const lod = info.lods[targetLod];
    const unitSplats = lod.points;
    const offset = Number(lod.offset);
    const size = lod.size;

    const dataView = new DataView(await dataFileContent.slice(offset, offset + size).arrayBuffer());
    const shDataView = isHasSH ? new DataView(await shFileContent.slice(offset * 2, offset * 2 + size * 2).arrayBuffer()) : null;

    const unitProperties = initProperties(unitSplats);
    const unitProperties_f_rest = isHasSH ? Array.from({ length: 45 }, () => new Float32Array(unitSplats)) : null;

    for (let i = 0; i < unitSplats; i++) {
        decodeSplat(dataView, shDataView, i, compressInfo, unitProperties, unitProperties_f_rest, isHasSH);
    }

    for (const key of floatProps) {
        properties[`property_${key}`].set(unitProperties[`property_${key}`], propertyOffset);
    }

    if (isHasSH && properties_f_rest && unitProperties_f_rest) {
        for (let j = 0; j < 45; j++) {
            properties_f_rest[j].set(unitProperties_f_rest[j], propertyOffset);
        }
    }

    return propertyOffset + unitSplats;
};

// this function would stream data directly into GSplatData buffers
const deserializeFromLcc = async (param:LccParam) => {
    const { totalSplats, unitInfos, targetLod, isHasSH, dataFileContent, shFileContent, compressInfo } = param;

    // properties to GSplatData
    const properties: Record<string, Float32Array> = initProperties(totalSplats);
    const properties_f_rest = isHasSH ? Array.from({ length: 45 }, () => createStorage(totalSplats)) : null;

    let propertyOffset = 0;
    for (const info of unitInfos) {
        propertyOffset = await processUnit({
            info,
            targetLod,
            isHasSH,
            dataFileContent,
            shFileContent,
            compressInfo,
            propertyOffset,
            properties,
            properties_f_rest
        });
    }

    const gsplatData = new GSplatData([{
        name: 'vertex',
        count: totalSplats,
        properties: [
            ...floatProps.map(name => ({
                type: 'float',
                name,
                storage: properties[`property_${name}`],
                byteSize: 4
            })),
            ...(isHasSH && properties_f_rest ?
                properties_f_rest.map((storage, i) => ({
                    type: 'float',
                    name: `f_rest_${i}`,
                    storage,
                    byteSize: 4
                })) :
                []),
            { type: 'float', name: 'state', storage: new Uint8Array(totalSplats), byteSize: 4 }
        ]
    }]);

    return gsplatData;
};

const loadLcc = async (loadRequest: ModelLoadRequest) => {
    const getResponse = async (contents: File, filename: string | undefined, url: string | undefined) => {
        const c = contents && (contents instanceof Response ? contents : new Response(contents));
        const response = await (c ?? fetch(url || filename));

        if (!response || !response.ok || !response.body) {
            throw new Error('Failed to fetch splat data');
        }
        return response;
    };

    // .lcc
    const response:Response = await getResponse(loadRequest.contents, loadRequest.filename, loadRequest.url);
    const text:string = await response.text();
    const meta = JSON.parse(text);

    const isHasSH: boolean = meta.fileType === 'Quality' || !!(loadRequest.mapFile('shcoef.bin'));
    const compressInfo: CompressInfo = parseMeta(meta);
    const splats: number[] = meta.splats;

    // select a lod level
    let targetLod =  splats.findIndex(value => value < LCC_LOD_MAX_SPLATS);
    if (targetLod < 0) {
        targetLod = splats.length - 1;
    }
    const totalSplats = splats[targetLod];

    // check files
    const indexFile = loadRequest.mapFile('index.bin');
    const dataFile = loadRequest.mapFile('data.bin');
    const shFile = isHasSH ? loadRequest.mapFile('shcoef.bin') : null;
    if (!indexFile?.contents) {
        throw new Error('Failed to fetch index.bin!');
    }
    if (!dataFile?.contents) {
        throw new Error('Failed to fetch data.bin!');
    }
    if (isHasSH && !shFile?.contents) {
        throw new Error('Failed to fetch shcoef.bin!');
    }

    // index.bin
    const indexRes = await getResponse(indexFile.contents, indexFile.filename, undefined);
    const indexArrayBuffer = await indexRes.arrayBuffer();
    const unitInfos: LccUnitInfo[] = parseIndexBin(indexArrayBuffer, meta);

    // data.bin + shcoef.bin -> gsplatData
    return await deserializeFromLcc({
        totalSplats,
        unitInfos,
        targetLod,
        isHasSH,
        dataFileContent: dataFile.contents,
        shFileContent: shFile?.contents,
        compressInfo
    });
};

export { loadLcc };
