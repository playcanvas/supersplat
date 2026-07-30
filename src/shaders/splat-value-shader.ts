import { applyColorGradeWGSL } from './color-grade-chunk';
import { indexToUvWGSL, paletteMatrixWGSL } from './palette-chunk';

const computeSplatValueWGSL = (bands: number, firstBinding = 1) => {
    let binding = firstBinding;
    const declarations = [
        `@group(0) @binding(${binding++}) var transformA: texture_2d<u32>;`,
        `@group(0) @binding(${binding++}) var transformB: texture_2d<f32>;`,
        `@group(0) @binding(${binding++}) var splatColor: texture_2d<f32>;`,
        `@group(0) @binding(${binding++}) var splatTransform: texture_2d<u32>;`,
        `@group(0) @binding(${binding++}) var transformPalette: texture_2d<f32>;`,
        `@group(0) @binding(${binding++}) var splatState: texture_2d<f32>;`
    ];
    if (bands > 0) declarations.push(`@group(0) @binding(${binding++}) var splatSH_1to3: texture_2d<u32>;`);
    if (bands > 1) {
        declarations.push(`@group(0) @binding(${binding++}) var splatSH_4to7: texture_2d<u32>;`);
        declarations.push(`@group(0) @binding(${binding++}) var splatSH_8to11: texture_2d<u32>;`);
    }
    if (bands > 2) declarations.push(`@group(0) @binding(${binding++}) var splatSH_12to15: texture_2d<u32>;`);
    declarations.push(`@group(0) @binding(${binding}) var<uniform> uniforms: SplatValueUniforms;`);

    const coefficientCount = bands === 1 ? 3 : bands === 2 ? 8 : 15;
    const shFunctions = bands === 0 ? '' : /* wgsl */`
fn unpackSHTriplet(coeffIdx: i32, uv: vec2i) -> vec3f {
    let first = textureLoad(splatSH_1to3, uv, 0);
    var packed = 0u;
    if (coeffIdx < 3) {
        packed = first[coeffIdx + 1];
    }
    ${bands > 1 ? `else if (coeffIdx < 7) {
        packed = textureLoad(splatSH_4to7, uv, 0)[coeffIdx - 3];
    } else if (coeffIdx < 11) {
        packed = textureLoad(splatSH_8to11, uv, 0)[coeffIdx - 7];
    }` : ''}
    ${bands > 2 ? `else if (coeffIdx < 15) {
        packed = textureLoad(splatSH_12to15, uv, 0)[coeffIdx - 11];
    }` : ''}
    let encoded = (vec3u(packed) >> vec3u(21u, 11u, 0u)) & vec3u(0x7ffu, 0x3ffu, 0x7ffu);
    let normalized = vec3f(encoded) / vec3f(2047.0, 1023.0, 2047.0) * 2.0 - 1.0;
    return normalized * bitcast<f32>(first.x);
}

fn readSHCoeff(s: SplatValue, index: i32) -> f32 {
    let channel = index / uniforms.shNumCoeffs;
    let triplet = unpackSHTriplet(index % uniforms.shNumCoeffs, s.uv);
    if (channel == 0) { return triplet.r; }
    if (channel == 1) { return triplet.g; }
    return triplet.b;
}

fn evaluateSH(s: SplatValue) -> vec3f {
    let direction = normalize(s.worldPos - uniforms.cameraWorldPos);
    var coefficients: array<vec3f, ${coefficientCount}>;
    for (var i = 0; i < ${coefficientCount}; i++) {
        coefficients[i] = unpackSHTriplet(i, s.uv);
    }
    var result = 0.4886025119029199 * (
        -coefficients[0] * direction.y
        + coefficients[1] * direction.z
        - coefficients[2] * direction.x
    );
    ${bands > 1 ? `let xx = direction.x * direction.x;
    let yy = direction.y * direction.y;
    let zz = direction.z * direction.z;
    let xy = direction.x * direction.y;
    let yz = direction.y * direction.z;
    let xz = direction.x * direction.z;
    result += coefficients[3] * (1.0925484305920792 * xy)
        + coefficients[4] * (-1.0925484305920792 * yz)
        + coefficients[5] * (0.31539156525252005 * (2.0 * zz - xx - yy))
        + coefficients[6] * (-1.0925484305920792 * xz)
        + coefficients[7] * (0.5462742152960396 * (xx - yy));` : ''}
    ${bands > 2 ? `result += coefficients[8] * (-0.5900435899266435 * direction.y * (3.0 * xx - yy))
        + coefficients[9] * (2.890611442640554 * xy * direction.z)
        + coefficients[10] * (-0.4570457994644658 * direction.y * (4.0 * zz - xx - yy))
        + coefficients[11] * (0.3731763325901154 * direction.z * (2.0 * zz - 3.0 * xx - 3.0 * yy))
        + coefficients[12] * (-0.4570457994644658 * direction.x * (4.0 * zz - xx - yy))
        + coefficients[13] * (1.445305721320277 * direction.z * (xx - yy))
        + coefficients[14] * (-0.5900435899266435 * direction.x * (xx - 3.0 * yy));` : ''}
    return result;
}`;

    const shDispatch = bands === 0 ? '' : `else if (uniforms.propMode >= 21 && uniforms.propMode <= 65) {
        value = readSHCoeff(s, uniforms.propMode - 21);
    }`;

    return {
        uniformBinding: binding,
        code: /* wgsl */`
struct SplatValueUniforms {
    sourceWidth: u32,
    numSplats: u32,
    propMode: i32,
    onScreenOnly: u32,
    entityMatrix: mat4x4f,
    viewMatrix: mat4x4f,
    viewProjection: mat4x4f,
    cameraWorldPos: vec3f,
    cgOffset: f32,
    cgScale: vec3f,
    cgSaturation: f32,
    transparency: f32,
    shNumCoeffs: i32,
    minValue: f32,
    maxValue: f32,
    numBins: i32,
    rangeStart: i32,
    rangeEnd: i32,
    colorMatchIndex: u32,
    colorMatchThreshold: f32
}

struct SplatValue {
    uv: vec2i,
    selected: bool,
    visible: bool,
    localPos: vec3f,
    worldPos: vec3f
}

${declarations.join('\n')}

${paletteMatrixWGSL}
${indexToUvWGSL('sourceCoord', 'uniforms.sourceWidth')}

${applyColorGradeWGSL}

fn rgbToHsv(color: vec3f) -> vec3f {
    let k = vec4f(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    let p = select(vec4f(color.bg, k.wz), vec4f(color.gb, k.xy), color.g >= color.b);
    let q = select(vec4f(p.xyw, color.r), vec4f(color.r, p.yzx), color.r >= p.x);
    let d = q.x - min(q.w, q.y);
    return vec3f(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}

fn readSplat(index: u32, value: ptr<function, SplatValue>) -> bool {
    if (index >= uniforms.numSplats) { return false; }
    let uv = sourceCoord(index);
    let state = i32(textureLoad(splatState, uv, 0).r * 255.0 + 0.5);
    if (state != 0 && state != 1) { return false; }
    let data = textureLoad(transformA, uv, 0);
    let localPos = bitcast<vec3f>(data.xyz);
    let paletteIndex = textureLoad(splatTransform, uv, 0).r;
    let worldPos = (uniforms.entityMatrix * paletteMatrix(paletteIndex) * vec4f(localPos, 1.0)).xyz;
    var visible = true;
    if (uniforms.onScreenOnly != 0u) {
        let clip = uniforms.viewProjection * vec4f(worldPos, 1.0);
        visible = clip.w > 0.0;
        if (visible) {
            let ndc = clip.xyz / clip.w;
            visible = abs(ndc.x) <= 1.0 && abs(ndc.y) <= 1.0 && ndc.z >= 0.0 && ndc.z <= 1.0;
        }
    }
    (*value).uv = uv;
    (*value).selected = state == 1;
    (*value).visible = visible;
    (*value).localPos = localPos;
    (*value).worldPos = worldPos;
    return true;
}

${shFunctions}

fn readFinalColor(s: SplatValue) -> vec3f {
    var color = textureLoad(splatColor, s.uv, 0).rgb;
    ${bands > 0 ? 'color += evaluateSH(s);' : ''}
    return applyColorGrade(color, uniforms.cgScale, uniforms.cgOffset, uniforms.cgSaturation);
}

fn computeSplatValue(index: u32, valueOut: ptr<function, f32>, selectedOut: ptr<function, bool>, visibleOut: ptr<function, bool>) -> bool {
    var s: SplatValue;
    if (!readSplat(index, &s)) {
        (*selectedOut) = false;
        (*visibleOut) = false;
        return false;
    }
    (*selectedOut) = s.selected;
    (*visibleOut) = s.visible;
    var value = 0.0;
    if (uniforms.propMode == 0) { value = s.worldPos.x; }
    else if (uniforms.propMode == 1) { value = s.worldPos.y; }
    else if (uniforms.propMode == 2) { value = s.worldPos.z; }
    else if (uniforms.propMode == 3) { value = length(s.worldPos); }
    else if (uniforms.propMode == 4) { value = -(uniforms.viewMatrix * vec4f(s.worldPos, 1.0)).z; }
    else if (uniforms.propMode >= 5 && uniforms.propMode <= 7) {
        value = readFinalColor(s)[uniforms.propMode - 5];
    } else if (uniforms.propMode == 8) {
        value = textureLoad(splatColor, s.uv, 0).a * uniforms.transparency;
    } else if (uniforms.propMode >= 9 && uniforms.propMode <= 13) {
        let scale = textureLoad(transformB, s.uv, 0).xyz;
        if (uniforms.propMode <= 11) { value = scale[uniforms.propMode - 9]; }
        else if (uniforms.propMode == 12) { value = scale.x * scale.y * scale.z; }
        else { value = dot(scale, scale); }
    } else if (uniforms.propMode >= 14 && uniforms.propMode <= 17) {
        let dataA = textureLoad(transformA, s.uv, 0);
        let dataB = textureLoad(transformB, s.uv, 0);
        let xy = unpack2x16float(dataA.w);
        let rotation = vec4f(sqrt(max(0.0, 1.0 - xy.x * xy.x - xy.y * xy.y - dataB.w * dataB.w)), xy, dataB.w);
        value = rotation[uniforms.propMode - 14];
    } else if (uniforms.propMode >= 18 && uniforms.propMode <= 20) {
        let hsv = rgbToHsv(clamp(readFinalColor(s), vec3f(0.0), vec3f(1.0)));
        value = hsv[uniforms.propMode - 18];
        if (uniforms.propMode == 18) { value *= 360.0; }
    } ${shDispatch} else if (uniforms.propMode >= 66 && uniforms.propMode <= 68) {
        value = (textureLoad(splatColor, s.uv, 0).rgb[uniforms.propMode - 66] - 0.5) / 0.28209479177387814;
    }
    (*valueOut) = value;
    return true;
}
`
    };
};

export { computeSplatValueWGSL };
