import { applyColorGradeWGSL } from './color-grade-chunk';
import { indexToUvWGSL, paletteMatrixWGSL } from './palette-chunk';

const shCode = (bands: number) => {
    if (bands === 0) {
        return `
fn evaluateSH(sourceUv: vec2i, direction: vec3f) -> vec3f {
    return vec3f(0.0);
}`;
    }

    const count = bands === 1 ? 3 : bands === 2 ? 8 : 15;
    const loads = [
        `let first = textureLoad(splatSH_1to3, sourceUv, 0);
    let scale = bitcast<f32>(first.x);
    coefficients[0] = unpack111011s(first.y);
    coefficients[1] = unpack111011s(first.z);
    coefficients[2] = unpack111011s(first.w);`
    ];

    if (bands > 1) {
        loads.push(`let second = textureLoad(splatSH_4to7, sourceUv, 0);
    coefficients[3] = unpack111011s(second.x);
    coefficients[4] = unpack111011s(second.y);
    coefficients[5] = unpack111011s(second.z);
    coefficients[6] = unpack111011s(second.w);
    coefficients[7] = unpack111011s(textureLoad(splatSH_8to11, sourceUv, 0).x);`);
    }

    if (bands > 2) {
        loads[loads.length - 1] = `let second = textureLoad(splatSH_4to7, sourceUv, 0);
    coefficients[3] = unpack111011s(second.x);
    coefficients[4] = unpack111011s(second.y);
    coefficients[5] = unpack111011s(second.z);
    coefficients[6] = unpack111011s(second.w);
    let third = textureLoad(splatSH_8to11, sourceUv, 0);
    coefficients[7] = unpack111011s(third.x);
    coefficients[8] = unpack111011s(third.y);
    coefficients[9] = unpack111011s(third.z);
    coefficients[10] = unpack111011s(third.w);
    let fourth = textureLoad(splatSH_12to15, sourceUv, 0);
    coefficients[11] = unpack111011s(fourth.x);
    coefficients[12] = unpack111011s(fourth.y);
    coefficients[13] = unpack111011s(fourth.z);
    coefficients[14] = unpack111011s(fourth.w);`;
    }

    const band2 = bands > 1 ? `
    let xx = direction.x * direction.x;
    let yy = direction.y * direction.y;
    let zz = direction.z * direction.z;
    let xy = direction.x * direction.y;
    let yz = direction.y * direction.z;
    let xz = direction.x * direction.z;
    result += coefficients[3] * (1.0925484305920792 * xy)
        + coefficients[4] * (-1.0925484305920792 * yz)
        + coefficients[5] * (0.31539156525252005 * (2.0 * zz - xx - yy))
        + coefficients[6] * (-1.0925484305920792 * xz)
        + coefficients[7] * (0.5462742152960396 * (xx - yy));` : '';

    const band3 = bands > 2 ? `
    result += coefficients[8] * (-0.5900435899266435 * direction.y * (3.0 * xx - yy))
        + coefficients[9] * (2.890611442640554 * xy * direction.z)
        + coefficients[10] * (-0.4570457994644658 * direction.y * (4.0 * zz - xx - yy))
        + coefficients[11] * (0.3731763325901154 * direction.z * (2.0 * zz - 3.0 * xx - 3.0 * yy))
        + coefficients[12] * (-0.4570457994644658 * direction.x * (4.0 * zz - xx - yy))
        + coefficients[13] * (1.445305721320277 * direction.z * (xx - yy))
        + coefficients[14] * (-0.5900435899266435 * direction.x * (xx - 3.0 * yy));` : '';

    return `
fn unpack111011s(bits: u32) -> vec3f {
    let value = vec3u((vec3u(bits) >> vec3u(21u, 11u, 0u)) & vec3u(0x7ffu, 0x3ffu, 0x7ffu));
    return vec3f(value) / vec3f(2047.0, 1023.0, 2047.0) * 2.0 - 1.0;
}

fn evaluateSH(sourceUv: vec2i, direction: vec3f) -> vec3f {
    var coefficients: array<vec3f, ${count}>;
    ${loads.join('\n    ')}
    var result = 0.4886025119029199 * (
        -coefficients[0] * direction.y
        + coefficients[1] * direction.z
        - coefficients[2] * direction.x
    );${band2}${band3}
    return result * scale;
}`;
};

const projectedSplatProjector = (bands: number) => /* wgsl */`
struct ProjectorUniforms {
    numSplats: u32,
    entryBase: u32,
    sourceWidth: u32,
    cacheWidth: u32,
    viewport: vec2f,
    isOrtho: u32,
    focal: vec2f,
    model: mat4x4f,
    view: mat4x4f,
    viewProj: mat4x4f,
    cameraPosition: vec3f,
    saturation: f32,
    colorOffset: vec4f,
    colorScale: vec4f,
    selectedColor: vec4f,
    lockedColor: vec4f,
    indexed: u32,
    visible: u32,
    selectionEnabled: u32,
    pickOp: i32,
    minPixelSize: f32
}

@group(0) @binding(0) var<storage, read_write> sortKeys: array<u32>;
@group(0) @binding(1) var cacheA: texture_storage_2d<rgba32uint, write>;
@group(0) @binding(2) var cacheB: texture_storage_2d<r32uint, write>;
@group(0) @binding(3) var<storage, read> sourceIndices: array<u32>;
@group(0) @binding(4) var transformA: texture_2d<u32>;
@group(0) @binding(5) var transformB: texture_2d<f32>;
@group(0) @binding(6) var splatColor: texture_2d<f32>;
@group(0) @binding(7) var splatState: texture_2d<f32>;
@group(0) @binding(8) var splatTransform: texture_2d<u32>;
@group(0) @binding(9) var transformPalette: texture_2d<f32>;
${bands > 0 ? '@group(0) @binding(10) var splatSH_1to3: texture_2d<u32>;' : ''}
${bands > 1 ? '@group(0) @binding(11) var splatSH_4to7: texture_2d<u32>;\n@group(0) @binding(12) var splatSH_8to11: texture_2d<u32>;' : ''}
${bands > 2 ? '@group(0) @binding(13) var splatSH_12to15: texture_2d<u32>;' : ''}
@group(0) @binding(${10 + (bands > 0 ? 1 : 0) + (bands > 1 ? 2 : 0) + (bands > 2 ? 1 : 0)}) var<uniform> uniforms: ProjectorUniforms;

${shCode(bands)}
${indexToUvWGSL('sourceCoord', 'uniforms.sourceWidth')}
${indexToUvWGSL('cacheCoord', 'uniforms.cacheWidth')}
${paletteMatrixWGSL}
${applyColorGradeWGSL}

fn rotationMatrix(qIn: vec4f) -> mat3x3f {
    let q = normalize(qIn);
    let x = q.x;
    let y = q.y;
    let z = q.z;
    let w = q.w;
    return mat3x3f(
        vec3f(1.0 - 2.0 * (y * y + z * z), 2.0 * (x * y + w * z), 2.0 * (x * z - w * y)),
        vec3f(2.0 * (x * y - w * z), 1.0 - 2.0 * (x * x + z * z), 2.0 * (y * z + w * x)),
        vec3f(2.0 * (x * z + w * y), 2.0 * (y * z - w * x), 1.0 - 2.0 * (x * x + y * y))
    );
}

fn writeInvalid(entry: u32) {
    sortKeys[entry] = 0x000fffffu;
    let uv = cacheCoord(entry);
    textureStore(cacheA, uv, vec4u(0u));
    textureStore(cacheB, uv, vec4u(0u));
}

@compute @workgroup_size(256)
fn main(
    @builtin(global_invocation_id) gid: vec3u,
    @builtin(num_workgroups) numWorkgroups: vec3u
) {
    let localIndex = gid.y * numWorkgroups.x * 256u + gid.x;
    if (localIndex >= uniforms.numSplats) {
        return;
    }

    let entry = uniforms.entryBase + localIndex;
    if (uniforms.visible == 0u) {
        writeInvalid(entry);
        return;
    }

    var sourceIndex = localIndex;
    if (uniforms.indexed != 0u) {
        sourceIndex = sourceIndices[localIndex];
    }
    let uv = sourceCoord(sourceIndex);
    let state = u32(textureLoad(splatState, uv, 0).r * 255.0 + 0.5) & 7u;
    if (uniforms.pickOp < 0) {
        if ((state & 4u) != 0u) {
            writeInvalid(entry);
            return;
        }
    } else if ((uniforms.pickOp == 0 && state != 0u)
        || (uniforms.pickOp == 1 && state != 1u)
        || (uniforms.pickOp == 2 && (state & 6u) != 0u)) {
        writeInvalid(entry);
        return;
    }

    let a = textureLoad(transformA, uv, 0);
    let b = textureLoad(transformB, uv, 0);
    let packedRotation = unpack2x16float(a.w);
    let rotation = vec4f(packedRotation, b.w, sqrt(max(0.0, 1.0 - dot(vec3f(packedRotation, b.w), vec3f(packedRotation, b.w)))));
    let localCenter = bitcast<vec3f>(a.xyz);
    let paletteIndex = textureLoad(splatTransform, uv, 0).r;
    let model = uniforms.model * paletteMatrix(paletteIndex);
    let worldCenter = model * vec4f(localCenter, 1.0);
    let viewCenter = uniforms.view * worldCenter;
    let depth = -viewCenter.z;
    if (uniforms.isOrtho == 0u && depth <= 0.0) {
        writeInvalid(entry);
        return;
    }

    let clip = uniforms.viewProj * worldCenter;
    if (clip.w == 0.0) {
        writeInvalid(entry);
        return;
    }

    let viewport = uniforms.viewport;
    let focal = uniforms.focal;

    let modelView = uniforms.view * model;
    let linear = mat3x3f(modelView[0].xyz, modelView[1].xyz, modelView[2].xyz);
    let gaussian = linear * rotationMatrix(rotation) * mat3x3f(
        vec3f(b.x, 0.0, 0.0),
        vec3f(0.0, b.y, 0.0),
        vec3f(0.0, 0.0, b.z)
    );
    let row0 = vec3f(gaussian[0].x, gaussian[1].x, gaussian[2].x);
    let row1 = vec3f(gaussian[0].y, gaussian[1].y, gaussian[2].y);
    let row2 = vec3f(gaussian[0].z, gaussian[1].z, gaussian[2].z);
    let c00 = dot(row0, row0);
    let c01 = dot(row0, row1);
    let c02 = dot(row0, row2);
    let c11 = dot(row1, row1);
    let c12 = dot(row1, row2);
    let c22 = dot(row2, row2);

    var cov00: f32;
    var cov01: f32;
    var cov11: f32;
    if (uniforms.isOrtho != 0u) {
        cov00 = focal.x * focal.x * c00;
        cov01 = focal.x * focal.y * c01;
        cov11 = focal.y * focal.y * c11;
    } else {
        let safeDepth = max(depth, 0.001);
        let invDepth = 1.0 / safeDepth;
        let jx0 = focal.x * invDepth;
        let jx2 = focal.x * viewCenter.x * invDepth * invDepth;
        let jy1 = focal.y * invDepth;
        let jy2 = focal.y * viewCenter.y * invDepth * invDepth;
        let u00 = jx0 * c00 + jx2 * c02;
        let u01 = jx0 * c01 + jx2 * c12;
        let u02 = jx0 * c02 + jx2 * c22;
        let u11 = jy1 * c11 + jy2 * c12;
        let u12 = jy1 * c12 + jy2 * c22;
        cov00 = u00 * jx0 + u02 * jx2;
        cov01 = u01 * jy1 + u02 * jy2;
        cov11 = u11 * jy1 + u12 * jy2;
    }

    cov00 += 0.3;
    cov11 += 0.3;
    let determinant = cov00 * cov11 - cov01 * cov01;
    if (determinant <= 0.0) {
        writeInvalid(entry);
        return;
    }

    let maxRadius = min(1024.0, min(viewport.x, viewport.y));
    let radiusXUncapped = sqrt(2.0 * cov00);
    let radiusYUncapped = sqrt(2.0 * cov11);
    let capScale = max(1.0, max(radiusXUncapped, radiusYUncapped) / maxRadius);
    let invCapScale2 = 1.0 / (capScale * capScale);
    cov00 *= invCapScale2;
    cov01 *= invCapScale2;
    cov11 *= invCapScale2;

    let mid = 0.5 * (cov00 + cov11);
    let radius = length(vec2f(0.5 * (cov00 - cov11), cov01));
    let lambda1 = mid + radius;
    let lambda2 = max(mid - radius, 0.1);

    // skip splats whose projected size falls below the cull threshold
    if (2.0 * sqrt(2.0 * lambda1) < uniforms.minPixelSize) {
        writeInvalid(entry);
        return;
    }

    let direction = normalize(vec2f(cov01, lambda1 - cov00));
    let axis1 = 2.0 * min(sqrt(2.0 * lambda1), maxRadius) * direction;
    let len2 = 2.0 * min(sqrt(2.0 * lambda2), maxRadius);
    let axis2 = len2 * vec2f(direction.y, -direction.x);

    let ndc = clip.xy / clip.w;
    let extent = abs(axis1) + abs(axis2);
    let centerPixels = (ndc * 0.5 + 0.5) * viewport;
    if (centerPixels.x + extent.x < 0.0 || centerPixels.x - extent.x > viewport.x
        || centerPixels.y + extent.y < 0.0 || centerPixels.y - extent.y > viewport.y) {
        writeInvalid(entry);
        return;
    }

    var color = textureLoad(splatColor, uv, 0);
    if (${bands}u > 0u) {
        let worldDirection = normalize(worldCenter.xyz - uniforms.cameraPosition);
        let localDirection = normalize(transpose(mat3x3f(model[0].xyz, model[1].xyz, model[2].xyz)) * worldDirection);
        color = vec4f(color.rgb + evaluateSH(uv, localDirection), color.a);
    }
    color = vec4f(
        applyColorGrade(color.rgb, uniforms.colorScale.rgb, uniforms.colorOffset.x, uniforms.saturation),
        clamp(color.a * uniforms.colorScale.w + uniforms.colorOffset.w, 0.0, 1.0)
    );

    let selected = (state & 1u) != 0u && uniforms.selectionEnabled != 0u;
    let locked = (state & 2u) != 0u;
    if (locked) {
        color *= uniforms.lockedColor;
    } else if (selected) {
        color = vec4f(mix(color.rgb, uniforms.selectedColor.rgb, uniforms.selectedColor.a), color.a);
    }
    color = vec4f(max(color.rgb, vec3f(0.0)), color.a);
    if (color.a <= 0.0) {
        writeInvalid(entry);
        return;
    }

    // rgb: 10/10/10 unorm with a 2-bit shared exponent (scale 1/2/4/8, range [0, 8])
    let maxChannel = max(color.r, max(color.g, color.b));
    var exponent = 0u;
    if (maxChannel > 4.0) {
        exponent = 3u;
    } else if (maxChannel > 2.0) {
        exponent = 2u;
    } else if (maxChannel > 1.0) {
        exponent = 1u;
    }
    let rgb = vec3u(clamp(color.rgb / f32(1u << exponent), vec3f(0.0), vec3f(1.0)) * 1023.0 + 0.5);

    // center: ndc as snorm16. The offscreen cull above bounds visible centers to
    // |ndc| <= 1 + 2 * extentMax / viewport with extentMax = 4 * maxRadius; the
    // render shader derives the same range from its viewport uniform
    let ndcRange = vec2f(1.0) + vec2f(8.0 * maxRadius) / viewport;

    let cacheUv = cacheCoord(entry);
    textureStore(cacheA, cacheUv, vec4u(
        pack2x16snorm(ndc / ndcRange),
        bitcast<u32>(depth),
        rgb.r | (rgb.g << 10u) | (rgb.b << 20u) | (exponent << 30u),
        pack2x16float(axis1)
    ));
    textureStore(cacheB, cacheUv, vec4u(
        pack2x16float(vec2f(len2, 0.0))
            | (u32(clamp(color.a, 0.0, 1.0) * 255.0 + 0.5) << 16u)
            | select(0u, 0x01000000u, selected)
            | select(0u, 0x02000000u, locked)
    ));
    sortKeys[entry] = (~bitcast<u32>(depth)) >> 12u;
}
`;

export { projectedSplatProjector };
