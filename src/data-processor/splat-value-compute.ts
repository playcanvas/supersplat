import {
    SAMPLETYPE_FLOAT,
    SAMPLETYPE_UINT,
    SAMPLETYPE_UNFILTERABLE_FLOAT,
    SHADERSTAGE_COMPUTE,
    UNIFORMTYPE_FLOAT,
    UNIFORMTYPE_INT,
    UNIFORMTYPE_MAT4,
    UNIFORMTYPE_UINT,
    UNIFORMTYPE_VEC3,
    BindStorageBufferFormat,
    BindTextureFormat,
    Compute,
    GraphicsDevice,
    Mat4,
    UniformBufferFormat,
    UniformFormat,
    Vec3
} from 'playcanvas';

import { createGradeTerms, gradeTerms } from '../color-grade';
import { Splat } from '../splat';

const identity = new Mat4();
const zeroVec3 = new Vec3();
const SH_NUM_COEFFS = [0, 3, 8, 15];
const terms = createGradeTerms();

type SplatValueOptions = {
    entityMatrix?: Mat4;
    viewMatrix?: Mat4;
    viewProjection?: Mat4;
    cameraPos?: Vec3;
    onScreenOnly?: boolean;
};

const createSplatValueUniformFormat = (device: GraphicsDevice) => new UniformBufferFormat(device, [
    new UniformFormat('sourceWidth', UNIFORMTYPE_UINT),
    new UniformFormat('numSplats', UNIFORMTYPE_UINT),
    new UniformFormat('propMode', UNIFORMTYPE_INT),
    new UniformFormat('onScreenOnly', UNIFORMTYPE_UINT),
    new UniformFormat('entityMatrix', UNIFORMTYPE_MAT4),
    new UniformFormat('viewMatrix', UNIFORMTYPE_MAT4),
    new UniformFormat('viewProjection', UNIFORMTYPE_MAT4),
    new UniformFormat('cameraWorldPos', UNIFORMTYPE_VEC3),
    new UniformFormat('cgOffset', UNIFORMTYPE_FLOAT),
    new UniformFormat('cgScale', UNIFORMTYPE_VEC3),
    new UniformFormat('cgSaturation', UNIFORMTYPE_FLOAT),
    new UniformFormat('transparency', UNIFORMTYPE_FLOAT),
    new UniformFormat('shNumCoeffs', UNIFORMTYPE_INT),
    new UniformFormat('minValue', UNIFORMTYPE_FLOAT),
    new UniformFormat('maxValue', UNIFORMTYPE_FLOAT),
    new UniformFormat('numBins', UNIFORMTYPE_INT),
    new UniformFormat('rangeStart', UNIFORMTYPE_INT),
    new UniformFormat('rangeEnd', UNIFORMTYPE_INT),
    new UniformFormat('colorMatchIndex', UNIFORMTYPE_UINT),
    new UniformFormat('colorMatchThreshold', UNIFORMTYPE_FLOAT)
]);

const createSplatValueTextureFormats = (bands: number) => {
    // order must match the declarations in computeSplatValueWGSL
    const formats: (BindStorageBufferFormat | BindTextureFormat)[] = [
        new BindStorageBufferFormat('instanceSource', SHADERSTAGE_COMPUTE, true),
        new BindStorageBufferFormat('instanceFlags', SHADERSTAGE_COMPUTE, true),
        new BindStorageBufferFormat('instancePalette', SHADERSTAGE_COMPUTE, true),
        new BindTextureFormat('transformA', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_UINT, false),
        new BindTextureFormat('transformB', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_FLOAT, false),
        new BindTextureFormat('splatColor', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_FLOAT, false),
        new BindTextureFormat('transformPalette', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_UNFILTERABLE_FLOAT, false)
    ];
    const uintTexture = (name: string) => new BindTextureFormat(name, SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_UINT, false);
    if (bands > 0) formats.push(uintTexture('splatSH_1to3'));
    if (bands > 1) {
        formats.push(uintTexture('splatSH_4to7'));
        formats.push(uintTexture('splatSH_8to11'));
    }
    if (bands > 2) formats.push(uintTexture('splatSH_12to15'));
    return formats;
};

const setSplatValueParameters = (
    compute: Compute,
    splat: Splat,
    mode: number,
    options?: SplatValueOptions,
    minValue = 0,
    maxValue = 0,
    numBins = 0,
    rangeStart = 0,
    rangeEnd = 0
) => {
    const resource = splat.resource;
    const bands = resource.shBands;
    const transformA = resource.getTexture('transformA');
    const entityMatrix = options?.entityMatrix ?? identity;
    const viewMatrix = options?.viewMatrix ?? identity;
    const viewProjection = options?.viewProjection ?? identity;
    const cameraPos = options?.cameraPos ?? zeroVec3;
    const grade = gradeTerms(splat, terms);

    compute.setParameter('instanceSource', splat.instances.instanceSource);
    compute.setParameter('instanceFlags', splat.instances.instanceFlags);
    compute.setParameter('instancePalette', splat.instances.instancePalette);
    compute.setParameter('transformA', transformA);
    compute.setParameter('transformB', resource.getTexture('transformB'));
    compute.setParameter('splatColor', resource.getTexture('splatColor'));
    compute.setParameter('transformPalette', splat.transformPalette.texture);
    if (bands > 0) compute.setParameter('splatSH_1to3', resource.getTexture('splatSH_1to3'));
    if (bands > 1) {
        compute.setParameter('splatSH_4to7', resource.getTexture('splatSH_4to7'));
        compute.setParameter('splatSH_8to11', resource.getTexture('splatSH_8to11'));
    }
    if (bands > 2) compute.setParameter('splatSH_12to15', resource.getTexture('splatSH_12to15'));

    compute.setParameter('sourceWidth', transformA.width);
    // the iteration domain is instances, not static rows
    compute.setParameter('numSplats', splat.instances.count);
    compute.setParameter('propMode', mode);
    compute.setParameter('onScreenOnly', options?.onScreenOnly ? 1 : 0);
    compute.setParameter('entityMatrix', entityMatrix.data);
    compute.setParameter('viewMatrix', viewMatrix.data);
    compute.setParameter('viewProjection', viewProjection.data);
    compute.setParameter('cameraWorldPos', [cameraPos.x, cameraPos.y, cameraPos.z]);
    compute.setParameter('cgOffset', grade.offset);
    compute.setParameter('cgScale', [grade.scale.r, grade.scale.g, grade.scale.b]);
    compute.setParameter('cgSaturation', grade.saturation);
    compute.setParameter('transparency', grade.transparency);
    compute.setParameter('shNumCoeffs', SH_NUM_COEFFS[bands] ?? 0);
    compute.setParameter('minValue', minValue);
    compute.setParameter('maxValue', maxValue);
    compute.setParameter('numBins', numBins);
    compute.setParameter('rangeStart', rangeStart);
    compute.setParameter('rangeEnd', rangeEnd);
    compute.setParameter('colorMatchIndex', 0);
    compute.setParameter('colorMatchThreshold', 0);
};

export {
    createSplatValueTextureFormats,
    createSplatValueUniformFormat,
    setSplatValueParameters
};
export type { SplatValueOptions };
