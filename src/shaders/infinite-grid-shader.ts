const vertexShader = /* wgsl */`
uniform near_origin: vec3f;
uniform near_x: vec3f;
uniform near_y: vec3f;
uniform far_origin: vec3f;
uniform far_x: vec3f;
uniform far_y: vec3f;

attribute vertex_position: vec2f;
varying worldFar: vec3f;
varying worldNear: vec3f;

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    output.position = vec4f(input.vertex_position, 0.0, 1.0);
    let p = input.vertex_position * 0.5 + vec2f(0.5);
    output.worldNear = uniform.near_origin + uniform.near_x * p.x + uniform.near_y * p.y;
    output.worldFar = uniform.far_origin + uniform.far_x * p.x + uniform.far_y * p.y;
    return output;
}
`;

const fragmentShader = /* wgsl */`
uniform view_position: vec3f;
uniform matrix_viewProjection: mat4x4f;
uniform plane: i32;
var blueNoiseTex32: texture_2d<f32>;

varying worldFar: vec3f;
varying worldNear: vec3f;

const planes = array<vec4f, 3>(
    vec4f(1.0, 0.0, 0.0, 0.0),
    vec4f(0.0, 1.0, 0.0, 0.0),
    vec4f(0.0, 0.0, 1.0, 0.0)
);
const colors = array<vec3f, 3>(
    vec3f(1.0, 0.2, 0.2),
    vec3f(0.2, 1.0, 0.2),
    vec3f(0.2, 0.2, 1.0)
);
const axis0 = array<i32, 3>(1, 0, 0);
const axis1 = array<i32, 3>(2, 2, 1);

fn intersectPlane(pos: vec3f, dir: vec3f, planeValue: vec4f) -> f32 {
    let d = dot(dir, planeValue.xyz);
    if (abs(d) < 1e-6) {
        return -1.0;
    }
    return -(dot(pos, planeValue.xyz) + planeValue.w) / d;
}

fn pristineGrid(uv: vec2f, ddxValue: vec2f, ddyValue: vec2f, lineWidth: vec2f) -> f32 {
    let uvDeriv = vec2f(length(vec2f(ddxValue.x, ddyValue.x)), length(vec2f(ddxValue.y, ddyValue.y)));
    let invertLine = lineWidth > vec2f(0.5);
    let targetWidth = select(lineWidth, vec2f(1.0) - lineWidth, invertLine);
    let drawWidth = clamp(targetWidth, uvDeriv, vec2f(0.5));
    let lineAA = uvDeriv * 1.5;
    var gridUv = abs(fract(uv) * 2.0 - vec2f(1.0));
    gridUv = select(vec2f(1.0) - gridUv, gridUv, invertLine);
    var grid = smoothstep(drawWidth + lineAA, drawWidth - lineAA, gridUv);
    grid *= clamp(targetWidth / drawWidth, vec2f(0.0), vec2f(1.0));
    grid = mix(grid, targetWidth, clamp(uvDeriv * 2.0 - vec2f(1.0), vec2f(0.0), vec2f(1.0)));
    grid = select(grid, vec2f(1.0) - grid, invertLine);
    return mix(grid.x, 1.0, grid.y);
}

fn calcDepth(position: vec3f) -> f32 {
    let projected = uniform.matrix_viewProjection * vec4f(position, 1.0);
    return projected.z / projected.w;
}

fn writeDepth(alpha: f32) -> bool {
    let size = vec2i(textureDimensions(blueNoiseTex32, 0));
    let texel = vec2i(pcPosition.xy) % size;
    return alpha > textureLoad(blueNoiseTex32, texel, 0).y;
}

fn gridPosition(position: vec3f) -> vec2f {
    if (uniform.plane == 0) {
        return position.yz;
    }
    if (uniform.plane == 1) {
        return position.xz;
    }
    return position.xy;
}

@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
    var output: FragmentOutput;
    let rayOrigin = input.worldNear;
    let rayDirection = normalize(input.worldFar - input.worldNear);
    let t = intersectPlane(rayOrigin, rayDirection, planes[uniform.plane]);
    let worldPosition = rayOrigin + rayDirection * max(t, 0.0);
    let position = gridPosition(worldPosition);
    let derivativeX = dpdx(position);
    let derivativeY = dpdy(position);
    if (t < 0.0) {
        discard;
    }

    let epsilon = 1.0 / 255.0;
    let fade = 1.0 - smoothstep(400.0, 1000.0, length(worldPosition - uniform.view_position));
    if (fade < epsilon) {
        discard;
    }

    var levelPosition = position * 0.1;
    var levelSize = 2.0 / 1000.0;
    var levelAlpha = pristineGrid(levelPosition, derivativeX * 0.1, derivativeY * 0.1, vec2f(levelSize)) * fade;
    if (levelAlpha > epsilon) {
        let location = abs(levelPosition);
        var color = vec3f(0.9);
        if (location.x < levelSize) {
            color = select(colors[axis1[uniform.plane]], vec3f(1.0), location.y < levelSize);
        } else if (location.y < levelSize) {
            color = colors[axis0[uniform.plane]];
        }
        output.color = vec4f(color, levelAlpha);
        output.fragDepth = select(1.0, calcDepth(worldPosition), writeDepth(levelAlpha));
        return output;
    }

    levelPosition = position;
    levelSize = 1.0 / 100.0;
    levelAlpha = pristineGrid(levelPosition, derivativeX, derivativeY, vec2f(levelSize)) * fade;
    if (levelAlpha > epsilon) {
        output.color = vec4f(vec3f(0.7), levelAlpha);
        output.fragDepth = select(1.0, calcDepth(worldPosition), writeDepth(levelAlpha));
        return output;
    }

    levelPosition = position * 10.0;
    levelAlpha = pristineGrid(levelPosition, derivativeX * 10.0, derivativeY * 10.0, vec2f(levelSize)) * fade;
    if (levelAlpha > epsilon) {
        output.color = vec4f(vec3f(0.7), levelAlpha);
        output.fragDepth = select(1.0, calcDepth(worldPosition), writeDepth(levelAlpha));
        return output;
    }

    discard;
    return output;
}
`;

export { vertexShader, fragmentShader };
