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
uniform matrix_viewProjection: mat4x4f;
uniform grid_view_position: vec3f;
uniform grid_viewport_size: vec2f;
// bit i enables plane i: 0 = x (the yz plane), 1 = y (xz), 2 = z (xy)
uniform planeMask: i32;
var blueNoiseTex32: texture_2d<f32>;

varying worldFar: vec3f;
varying worldNear: vec3f;

const normals = array<vec3f, 3>(
    vec3f(1.0, 0.0, 0.0),
    vec3f(0.0, 1.0, 0.0),
    vec3f(0.0, 0.0, 1.0)
);
const colors = array<vec3f, 3>(
    vec3f(1.0, 0.2, 0.2),
    vec3f(0.2, 1.0, 0.2),
    vec3f(0.2, 0.2, 1.0)
);
// world axis running along each plane-space direction
const axis0 = array<i32, 3>(1, 0, 0);
const axis1 = array<i32, 3>(2, 2, 1);

// a decade level starts to fade in once its cells span this many pixels and is
// fully visible one decade later. Three levels are evaluated per pixel whatever
// the scale, so the grid never runs out of lines on large scenes and never
// floods the view with sub-pixel ones
const MIN_CELL_PIXELS = 7.0;
// its lines start occluding the splats behind them, and the level after next
// starts going bold, once its cells span this many pixels instead
const OCCLUDE_CELL_PIXELS = 8.0;

struct GridSample {
    // premultiplied colour and coverage
    color: vec3f,
    alpha: f32,
    // coverage of the lines that are allowed to occlude (see shadePlane)
    depthAlpha: f32
}

fn intersectPlane(pos: vec3f, dir: vec3f, normal: vec3f) -> f32 {
    let d = dot(dir, normal);
    if (abs(d) < 1e-6) {
        return -1.0;
    }
    return -dot(pos, normal) / d;
}

// exact screen-space derivative of the ray/plane hit point, given the
// derivatives of the ray's near and far points along one screen axis. The
// hardware dpdx/dpdy approximates this over 2x2 pixel quads and produces
// garbage wherever a quad straddles the horizon, which showed up as fat
// bands of line there
fn hitDerivative(near: vec3f, dNear: vec3f, dir: vec3f, dDir: vec3f, normal: vec3f) -> vec3f {
    let denom = dot(dir, normal);
    let num = -dot(near, normal);
    let t = num / denom;
    let dt = (-dot(dNear, normal) * denom - num * dot(dDir, normal)) / (denom * denom);
    return dNear + dDir * t + dir * dt;
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

fn log10(x: f32) -> f32 {
    return log2(x) * 0.30102999566;
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

fn gridPosition(position: vec3f, plane: i32) -> vec2f {
    if (plane == 0) {
        return position.yz;
    }
    if (plane == 1) {
        return position.xz;
    }
    return position.xy;
}

// composite src over the accumulated premultiplied colour
fn over(dst: ptr<function, GridSample>, color: vec3f, alpha: f32) {
    let remaining = 1.0 - (*dst).alpha;
    (*dst).color += color * alpha * remaining;
    (*dst).alpha += alpha * remaining;
}

// a clip-space point as homogeneous render-target pixel coordinates (y down,
// matching pcPosition). Keeping w lets points at infinity through
fn pixelPoint(clip: vec4f) -> vec3f {
    return vec3f((clip.x + clip.w) * 0.5 * uniform.grid_viewport_size.x, (clip.w - clip.y) * 0.5 * uniform.grid_viewport_size.y, clip.w);
}

// distance in pixels from this fragment to the projection of the world axis
// line through the origin along dir. Measured in screen space rather than from
// the plane hit's derivatives: near the horizon a pixel's footprint spans a
// huge stretch of the plane, so a derivative-based estimate reads every pixel
// as sitting on the axis and the line bloated into a white band
fn axisPixelDistance(dir: vec3f) -> f32 {
    let p0 = pixelPoint(uniform.matrix_viewProjection * vec4f(0.0, 0.0, 0.0, 1.0));
    let p1 = pixelPoint(uniform.matrix_viewProjection * vec4f(dir, 0.0));
    let line = cross(p0, p1);
    let len = length(line.xy);
    if (len < 1e-6) {
        // the axis is viewed end-on and projects to a point
        return 1e6;
    }
    return abs(dot(line, vec3f(pcPosition.xy, 1.0))) / len;
}

fn shadePlane(position: vec2f, ddxValue: vec2f, ddyValue: vec2f, plane: i32, distance: f32) -> GridSample {
    var result = GridSample(vec3f(0.0), 0.0, 0.0);

    // world units per pixel along each plane axis, and the larger of the two
    let pixel = max(vec2f(length(vec2f(ddxValue.x, ddyValue.x)), length(vec2f(ddxValue.y, ddyValue.y))), vec2f(1e-8));
    let footprint = max(pixel.x, pixel.y);

    // how squashed the pixel footprint is on the plane, as the ratio of the
    // singular values of its jacobian (sMax * sMin = det, sMax^2 + sMin^2 = sum).
    // Comparing the two axis footprints instead made this depend on the view
    // direction: down an axis the ratio fell to the sine of the elevation, on
    // the diagonal it stayed near one. Only used to stop occluding at grazing
    // angles, where dithered depth reads as noise through the splats
    let sum = dot(ddxValue, ddxValue) + dot(ddyValue, ddyValue);
    let det = abs(ddxValue.x * ddyValue.y - ddxValue.y * ddyValue.x);
    let sMax2 = 0.5 * (sum + sqrt(max(sum * sum - 4.0 * det * det, 0.0)));
    let grazing = smoothstep(0.005, 0.02, det / max(sMax2, 1e-16));

    // in the last pixel rows under the horizon the footprint is no longer small
    // against the distance to the hit point: perspective folds the lines of
    // every decade beyond into those rows and they pile up into a solid bright
    // edge. Fade the lines out as the footprint approaches the distance, which
    // is a fixed few pixels below the horizon whatever the scale of the scene
    let horizon = 1.0 - smoothstep(0.2, 0.6, footprint / distance);

    // the finest decade whose cells span at least MIN_CELL_PIXELS
    let base = ceil(log10(footprint * MIN_CELL_PIXELS));

    // axis lines: 1.5 pixels wide, on top of the levels, from their exact
    // screen-space distance, so they run crisply into their vanishing point.
    // Every level has a line under each axis, so fading them out any earlier
    // than the other lines would only reveal that bold grey line
    let axisCoverage = clamp(vec2f(1.5) - vec2f(axisPixelDistance(normals[axis0[plane]]), axisPixelDistance(normals[axis1[plane]])), vec2f(0.0), vec2f(1.0));
    let axisAlpha = max(axisCoverage.x, axisCoverage.y) * horizon;
    var axisColor = colors[axis0[plane]];
    if (axisCoverage.y > axisCoverage.x) {
        axisColor = colors[axis1[plane]];
    }
    if (axisCoverage.x > 0.5 && axisCoverage.y > 0.5) {
        axisColor = vec3f(1.0);
    }
    over(&result, axisColor, axisAlpha);
    result.depthAlpha = axisAlpha;

    // coarse levels draw over fine ones, so walk them bold-first
    for (var i = 2; i >= 0; i--) {
        let cell = pow(10.0, base + f32(i));
        // decades above the minimum cell size: fades in over the first, goes
        // bold over the second
        let s = log10(cell / (footprint * MIN_CELL_PIXELS));
        let minor = smoothstep(0.0, 1.0, s);
        let sOcclude = s - log10(OCCLUDE_CELL_PIXELS / MIN_CELL_PIXELS);
        let occlude = smoothstep(0.0, 1.0, sOcclude);
        let major = smoothstep(1.0, 2.0, sOcclude);
        // each line family is one pixel wide on screen, so its width in cell
        // units follows the footprint across that family, not the larger one
        let line = pristineGrid(position / cell, ddxValue / cell, ddyValue / cell, pixel / cell);
        let levelColor = mix(vec3f(0.4), vec3f(0.65), major);
        over(&result, levelColor, line * minor * horizon);

        // occlusion dithers in with the line's own strength, so a faint line is
        // a faintly dotted cut through the splats behind it, and fades out
        // radially around the camera with the grazing term
        result.depthAlpha = max(result.depthAlpha, line * occlude * grazing);
    }

    return result;
}

@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
    var output: FragmentOutput;
    let rayOrigin = input.worldNear;
    // unnormalized: t is then in units of the near-to-far span, which is all
    // the ordering and the derivatives below need
    let rayDirection = input.worldFar - input.worldNear;

    // the near and far points are affine in screen position (fullscreen quad),
    // so their derivatives are exact and safe to take up front
    let dNearX = dpdx(input.worldNear);
    let dNearY = dpdy(input.worldNear);
    let dDirX = dpdx(input.worldFar) - dNearX;
    let dDirY = dpdy(input.worldFar) - dNearY;

    var t: array<f32, 3>;
    var worldPosition: array<vec3f, 3>;
    var position: array<vec2f, 3>;
    var derivativeX: array<vec2f, 3>;
    var derivativeY: array<vec2f, 3>;
    for (var i = 0; i < 3; i++) {
        t[i] = intersectPlane(rayOrigin, rayDirection, normals[i]);
        worldPosition[i] = rayOrigin + rayDirection * max(t[i], 0.0);
        position[i] = gridPosition(worldPosition[i], i);
        derivativeX[i] = gridPosition(hitDerivative(rayOrigin, dNearX, rayDirection, dDirX, normals[i]), i);
        derivativeY[i] = gridPosition(hitDerivative(rayOrigin, dNearY, rayDirection, dDirY, normals[i]), i);
    }

    // nearest plane first
    var order = array<i32, 3>(0, 1, 2);
    if (t[order[0]] > t[order[1]]) { let tmp = order[0]; order[0] = order[1]; order[1] = tmp; }
    if (t[order[1]] > t[order[2]]) { let tmp = order[1]; order[1] = order[2]; order[2] = tmp; }
    if (t[order[0]] > t[order[1]]) { let tmp = order[0]; order[0] = order[1]; order[1] = tmp; }

    var result = GridSample(vec3f(0.0), 0.0, 0.0);
    var depth = 1.0;
    var depthWritten = false;
    for (var k = 0; k < 3; k++) {
        let i = order[k];
        if ((uniform.planeMask & (1 << u32(i))) == 0 || t[i] <= 0.0) {
            continue;
        }
        // with several planes enabled, only the part of a plane on the camera's
        // side of every other enabled plane is drawn, so the planes read as a
        // room corner instead of crossing each other
        var behind = false;
        for (var j = 0; j < 3; j++) {
            if (j != i && (uniform.planeMask & (1 << u32(j))) != 0 && dot(worldPosition[i], normals[j]) * dot(uniform.grid_view_position, normals[j]) < 0.0) {
                behind = true;
            }
        }
        if (behind) {
            continue;
        }
        let sample = shadePlane(position[i], derivativeX[i], derivativeY[i], i, length(worldPosition[i] - uniform.grid_view_position));
        over(&result, sample.color / max(sample.alpha, 1e-6), sample.alpha);
        if (!depthWritten && writeDepth(sample.depthAlpha)) {
            depth = calcDepth(worldPosition[i]);
            depthWritten = true;
        }
    }

    if (result.alpha < 1.0 / 255.0) {
        discard;
    }

    output.color = vec4f(result.color / result.alpha, result.alpha);
    output.fragDepth = depth;
    return output;
}
`;

export { vertexShader, fragmentShader };
