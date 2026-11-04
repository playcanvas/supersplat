// WGSL for the diagnostic views that read the shared float32 depth target:
// depth display, depth-derived normals, normal-derived curvature and edges.
// Depth *rasterisation* lives in depth-render-shader.ts.

// Display mapping is separate from the float32 camera-space Z texture.
const depthDisplayShader = /* wgsl */ `
var rawDepth: texture_2d<u32>;
var<storage, read> displayStats: array<u32>;
@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
    var output: FragmentOutput;
    let raw = textureLoad(rawDepth,vec2i(pcPosition.xy),0);
    let range=vec2f(bitcast<f32>(displayStats[4]),bitcast<f32>(displayStats[5]));
    let z=bitcast<f32>(raw.x);
    let d=select(1.0,clamp((z-range.x)/max(range.y-range.x,1e-6),0.0,1.0),raw.w!=0u);
    output.color=vec4f(vec3f(pow(d,1.0/2.2)),1.0);
    return output;
}
`;

// Alpha-composited depth -> world positions -> screen-space surface normals.
const surfaceFromDepthShader = /* wgsl */ `
var normalDepth: texture_2d<u32>;
uniform normalInverseViewProjection: mat4x4f;
uniform normalProjectionParams: vec3f;

fn sampleAt(p: vec2i) -> vec4f {
    let dims = vec2i(textureDimensions(normalDepth));
    let raw = textureLoad(normalDepth, clamp(p, vec2i(0), dims - vec2i(1)), 0);
    return vec4f(bitcast<f32>(raw.x), bitcast<f32>(raw.y), 0.0, f32(raw.w));
}

fn linearDepth(s: vec4f) -> f32 {
    return s.r;
}

fn worldAt(p: vec2i, depth: f32) -> vec3f {
    let uv = (vec2f(p) + vec2f(0.5)) / vec2f(textureDimensions(normalDepth));
    let w = select(depth, 1.0, uniform.normalProjectionParams.z != 0.0);
    let clip = vec4f((uv.x * 2.0 - 1.0) * w, (1.0 - uv.y * 2.0) * w,
        uniform.normalProjectionParams.x * depth + uniform.normalProjectionParams.y, w);
    let world = uniform.normalInverseViewProjection * clip;
    return world.xyz / world.w;
}

struct SurfaceSample {
    position: vec3f,
    normal: vec3f,
    depth: f32,
    valid: f32
}

fn surfaceAt(pixel: vec2i) -> SurfaceSample {
    var surface = SurfaceSample(vec3f(0.0), vec3f(0.0), 0.0, 0.0);
    let dims = vec2i(textureDimensions(normalDepth));
    let p = clamp(pixel, vec2i(0), dims - vec2i(1));
    let centerSample = sampleAt(p);
    if (centerSample.a < 0.05) { return surface; }
    let d = linearDepth(centerSample);
    let center = worldAt(p, d);
    surface.position = center;
    surface.depth = d;
    let left = max(p - vec2i(3, 0), vec2i(0));
    let right = min(p + vec2i(3, 0), dims - vec2i(1));
    let up = max(p - vec2i(0, 3), vec2i(0));
    let down = min(p + vec2i(0, 3), dims - vec2i(1));
    let sl = sampleAt(left);
    let sr = sampleAt(right);
    let su = sampleAt(up);
    let sd = sampleAt(down);
    let dl = linearDepth(sl);
    let dr = linearDepth(sr);
    let du = linearDepth(su);
    let dd = linearDepth(sd);
    // Reject neighbors across a depth discontinuity before taking any
    // difference: a one-sided sample must be on the same surface as the center.
    let jump = max(abs(d) * 0.02, 1e-4);
    // One-sided samples tolerate steeper continuous surfaces (orthographic
    // planes crossing Z=0) while still rejecting background jumps.
    let oneSidedJump = max(abs(d) * 0.1, 0.05);
    let validL = sl.a >= 0.05 && left.x != p.x && abs(dl - d) <= oneSidedJump;
    let validR = sr.a >= 0.05 && right.x != p.x && abs(dr - d) <= oneSidedJump;
    let validU = su.a >= 0.05 && up.y != p.y && abs(du - d) <= oneSidedJump;
    let validD = sd.a >= 0.05 && down.y != p.y && abs(dd - d) <= oneSidedJump;
    if ((!validL && !validR) || (!validU && !validD)) { return surface; }
    // Choose a one-sided difference on the same surface near occlusions.
    var dx = select(worldAt(right, dr) - center, center - worldAt(left, dl),
        validL && (!validR || abs(dl - d) < abs(dr - d)));
    var dy = select(center - worldAt(down, dd), worldAt(up, du) - center,
        validU && (!validD || abs(du - d) < abs(dd - d)));
    // On continuous surfaces central differences suppress quantization bias.
    if (validL && validR && max(abs(dl - d), abs(dr - d)) < jump) {
        dx = worldAt(right, dr) - worldAt(left, dl);
    }
    if (validU && validD && max(abs(du - d), abs(dd - d)) < jump) {
        dy = worldAt(up, du) - worldAt(down, dd);
    }
    let n = cross(dx, dy);
    let lengthSquared = dot(n, n);
    // Scale-relative degeneracy: |cross|^2 is an area squared, so a fixed
    // epsilon would reject small scenes / high-resolution samples.
    if (dot(dx, dx) > 0.0 && dot(dy, dy) > 0.0 && lengthSquared > dot(dx, dx) * dot(dy, dy) * 1e-12) {
        surface.normal = n * inverseSqrt(lengthSquared);
        surface.valid = 1.0;
    }
    return surface;
}
`;

const normalFragmentShader =
    surfaceFromDepthShader +
    /* wgsl */ `
@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
    var output: FragmentOutput;
    let surface = surfaceAt(vec2i(pcPosition.xy));
    output.color = vec4f(0.0, 0.0, 0.0, 1.0);
    if (surface.valid != 0.0) {
        output.color = vec4f(surface.normal * 0.5 + vec3f(0.5), 1.0);
    }
    return output;
}
`;

// Unsigned curvature estimated from the differential of world-space normals.
// The screen-space display scales it by the local sample footprint. This is a
// diagnostic of the visible surface, not a mesh's signed mean/Gaussian curvature.
const curvatureFragmentShader =
    surfaceFromDepthShader +
    /* wgsl */ `
uniform curvatureGain: f32;

fn connectedSurface(center: SurfaceSample, p: vec2i) -> SurfaceSample {
    var neighbor = surfaceAt(p);
    // Do not differentiate across a hole or a foreground/background depth jump.
    if (abs(neighbor.depth - center.depth) > max(abs(center.depth) * 0.02, 1e-4)) {
        neighbor.valid = 0.0;
    }
    return neighbor;
}

fn curvatureColor(value: f32) -> vec3f {
    let stops = array<vec3f, 5>(
        vec3f(0.0), vec3f(0.0, 0.2, 1.0), vec3f(0.0, 1.0, 1.0),
        vec3f(1.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0)
    );
    let t = clamp(value, 0.0, 1.0) * 4.0;
    let i = min(u32(t), 3u);
    return mix(stops[i], stops[i + 1u], t - f32(i));
}

@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
    var output: FragmentOutput;
    output.color = vec4f(0.0, 0.0, 0.0, 1.0);
    let p = vec2i(pcPosition.xy);
    let center = surfaceAt(p);
    if (center.valid == 0.0) { return output; }
    let left = connectedSurface(center, p - vec2i(2, 0));
    let right = connectedSurface(center, p + vec2i(2, 0));
    let up = connectedSurface(center, p - vec2i(0, 2));
    let down = connectedSurface(center, p + vec2i(0, 2));
    if ((left.valid == 0.0 && right.valid == 0.0) ||
        (up.valid == 0.0 && down.valid == 0.0)) { return output; }

    var dx: vec3f; var dy: vec3f; var dnx: vec3f; var dny: vec3f;
    if (left.valid != 0.0 && right.valid != 0.0) {
        dx = right.position - left.position; dnx = right.normal - left.normal;
    } else if (right.valid != 0.0) {
        dx = right.position - center.position; dnx = right.normal - center.normal;
    } else {
        dx = center.position - left.position; dnx = center.normal - left.normal;
    }
    if (up.valid != 0.0 && down.valid != 0.0) {
        dy = up.position - down.position; dny = up.normal - down.normal;
    } else if (up.valid != 0.0) {
        dy = up.position - center.position; dny = up.normal - center.normal;
    } else {
        dy = center.position - down.position; dny = center.normal - down.normal;
    }

    // Contract normal derivatives with the inverse surface metric. This avoids
    // treating a tilted, stretched pixel grid as orthogonal unit world axes.
    let xx = dot(dx, dx); let xy = dot(dx, dy); let yy = dot(dy, dy);
    let determinant = xx * yy - xy * xy;
    if (xx * yy <= 0.0 || determinant <= xx * yy * 1e-4) { return output; }
    let differential = (yy * dot(dnx, dnx) - 2.0 * xy * dot(dnx, dny) + xx * dot(dny, dny)) / determinant;
    let curvature = sqrt(max(differential * 0.5, 0.0));
    let footprint = sqrt((xx + yy) * 0.5);
    // Ignore sub-degree normal variation from projected-splat quantization and
    // depth reconstruction before applying gain (0.005 rad is about 0.29 deg).
    let variation = max(curvature * footprint - 0.005, 0.0);
    let strength = sqrt(clamp(variation * uniform.curvatureGain, 0.0, 1.0));
    output.color = vec4f(curvatureColor(strength), 1.0);
    return output;
}
`;

// Channel-wise RGB Sobel magnitude, matching the edge diagnostic's definition
// in GS Monitor. Clamp image boundaries so a flat frame has no artificial rim.
const edgeFragmentShader = /* wgsl */ `
var edgeColor: texture_2d<f32>;
uniform edgeGain: f32;

fn colorAt(p: vec2i) -> vec3f {
    let size = vec2i(textureDimensions(edgeColor));
    return textureLoad(edgeColor, clamp(p, vec2i(0), size - vec2i(1)), 0).rgb;
}

@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
    var output: FragmentOutput;
    let p = vec2i(pcPosition.xy);
    let tl = colorAt(p + vec2i(-1, -1));
    let t = colorAt(p + vec2i(0, -1));
    let tr = colorAt(p + vec2i(1, -1));
    let l = colorAt(p + vec2i(-1, 0));
    let r = colorAt(p + vec2i(1, 0));
    let bl = colorAt(p + vec2i(-1, 1));
    let b = colorAt(p + vec2i(0, 1));
    let br = colorAt(p + vec2i(1, 1));
    let gx = (-tl - 2.0 * l - bl + tr + 2.0 * r + br) * 0.25;
    let gy = (-tl - 2.0 * t - tr + bl + 2.0 * b + br) * 0.25;
    let edge = clamp(sqrt(dot(gx, gx) + dot(gy, gy)) * uniform.edgeGain, 0.0, 1.0);
    output.color = vec4f(vec3f(edge), 1.0);
    return output;
}
`;

export { curvatureFragmentShader, depthDisplayShader, edgeFragmentShader, normalFragmentShader };
