import { splatAlphaWGSL } from './projected-splat-chunk';

// Scatters the id pass's target into one bit per cache entry. The pass
// writes, for the selected layer alone, the frontmost gaussian whose
// footprint covers the pixel - the gaussian a visible-surface drag there would
// select (see ProjectedSplatRenderer) - as its cache entry plus one; zero is
// the clear, where no footprint reached the pixel. A gaussian owning any pixel
// is selectable from this camera, and with x-ray off only those draw their
// markers.
const projectedSplatVisibility = /* wgsl */ `
struct VisibilityUniforms {
    width: u32,
    height: u32,
    capacity: u32,
    pad0: u32
}

// the splat shader's idOutput: entry + 1 a byte a channel, 0 where none
fn decodeId(texel: vec4f) -> u32 {
    let bytes = vec4u(round(texel * 255.0));
    return bytes.x | (bytes.y << 8u) | (bytes.z << 16u) | (bytes.w << 24u);
}

@group(0) @binding(0) var idTexture: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> visible: array<atomic<u32>>;
@group(0) @binding(2) var<uniform> uniforms: VisibilityUniforms;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    if (id.x >= uniforms.width || id.y >= uniforms.height) {
        return;
    }
    let id1 = decodeId(textureLoad(idTexture, vec2i(id.xy), 0));
    if (id1 == 0u || id1 > uniforms.capacity) {
        return;
    }
    let entry = id1 - 1u;
    let word = entry >> 5u;
    let bit = 1u << (entry & 31u);
    // a large gaussian owns many pixels: read before the atomic so only the
    // first of them pays for it
    if ((atomicLoad(&visible[word]) & bit) == 0u) {
        atomicOr(&visible[word], bit);
    }
}
`;

// The frame's minimum-size cull keeps the gaussians it drops out of the splat
// pass, so they write no id, but the centres overlay draws them (from the
// compact list's culled tail) and a pick, which renders without the cull,
// can select them. One thread per tail entry decides as the pick would: the
// gaussian is selectable if the pixel under its centre has no owner, or an
// owner no nearer than itself
const projectedSplatVisibilityTail = /* wgsl */ `
struct TailUniforms {
    width: u32,
    height: u32,
    capacity: u32,
    cacheWidth: u32
}

@group(0) @binding(0) var<storage, read> compactEntries: array<u32>;
@group(0) @binding(1) var<storage, read> splatCounter: array<u32>;
@group(0) @binding(2) var cacheA: texture_2d<u32>;
@group(0) @binding(3) var idTexture: texture_2d<f32>;
@group(0) @binding(4) var<storage, read_write> visible: array<atomic<u32>>;
@group(0) @binding(5) var<uniform> uniforms: TailUniforms;

fn cacheUv(entry: u32) -> vec2i {
    return vec2i(i32(entry % uniforms.cacheWidth), i32(entry / uniforms.cacheWidth));
}

fn decodeId(texel: vec4f) -> u32 {
    let bytes = vec4u(round(texel * 255.0));
    return bytes.x | (bytes.y << 8u) | (bytes.z << 16u) | (bytes.w << 24u);
}

@compute @workgroup_size(256)
fn main(
    @builtin(global_invocation_id) gid: vec3u,
    @builtin(num_workgroups) numWorkgroups: vec3u
) {
    // the dispatch is split into rows once it exceeds the per-dimension limit
    let tail = gid.y * numWorkgroups.x * 256u + gid.x;
    if (tail >= splatCounter[1]) {
        return;
    }
    let entry = compactEntries[uniforms.capacity - 1u - tail];
    let a = textureLoad(cacheA, cacheUv(entry), 0);

    // the centre's pixel, decoded as the centres shader decodes its position
    let viewport = vec2f(f32(uniforms.width), f32(uniforms.height));
    let maxRadius = min(1024.0, min(viewport.x, viewport.y));
    let ndcRange = vec2f(1.0) + vec2f(4.0 * maxRadius) / viewport;
    let ndc = unpack2x16snorm(a.x) * ndcRange;
    let pixel = vec2i(floor(vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5) * viewport));
    if (pixel.x < 0 || pixel.y < 0 || pixel.x >= i32(uniforms.width) || pixel.y >= i32(uniforms.height)) {
        return;
    }

    let owner1 = decodeId(textureLoad(idTexture, pixel, 0));
    if (owner1 != 0u && owner1 <= uniforms.capacity) {
        let owner = owner1 - 1u;
        let ownerDepth = bitcast<f32>(textureLoad(cacheA, cacheUv(owner), 0).y);
        if (owner != entry && ownerDepth < bitcast<f32>(a.y)) {
            return;
        }
    }
    atomicOr(&visible[entry >> 5u], 1u << (entry & 31u));
}
`;

// Centres mode, after the stochastic id pass (ID_STOCHASTIC): a gaussian is
// selectable when enough of it can be seen, not merely when it wins a pixel.
// One thread per gaussian of the layer in the compact list - survivors and the
// size-culled tail, which the pick draws though the display does not - samples
// its footprint at fixed points, even in area, and asks at each whether the
// pixel's owner - the nearest fragment that survived its alpha - lies no
// nearer than the gaussian, nearer in the sort's order as the id pass's depth
// is (distance with a radial sort, view depth otherwise). Each pixel answers
// yes as often as light reaches the gaussian there, so the shape-weighted
// share of yes answers estimates how much of it shows. The gaussian's own
// survival never counts against it, so faint ones are judged on what covers
// them, and points off the target are left out. The id target is the
// display's (entry + 1, zero where none) or the pick's (entry less the layer
// base, all ones where none): entry = id + idOffset unless id is idNone
const projectedSplatVisibilitySample = /* wgsl */ `
${splatAlphaWGSL}

struct SampleUniforms {
    width: u32,
    height: u32,
    capacity: u32,
    cacheWidth: u32,
    rangeBase: u32,
    rangeCount: u32,
    idOffset: u32,
    idNone: u32,
    cutoff: f32,
    // the splat material's idDepthParams.xyz: radial sort, projection x/y scale
    radial: u32,
    projX: f32,
    projY: f32
}

@group(0) @binding(0) var<storage, read> compactEntries: array<u32>;
@group(0) @binding(1) var<storage, read> splatCounter: array<u32>;
@group(0) @binding(2) var cacheA: texture_2d<u32>;
@group(0) @binding(3) var cacheB: texture_2d<u32>;
@group(0) @binding(4) var idTexture: texture_2d<f32>;
@group(0) @binding(5) var<storage, read_write> visible: array<atomic<u32>>;
@group(0) @binding(6) var<uniform> uniforms: SampleUniforms;

const SAMPLES = 16u;
const GOLDEN_ANGLE = 2.39996323;

fn cacheUv(entry: u32) -> vec2i {
    return vec2i(i32(entry % uniforms.cacheWidth), i32(entry / uniforms.cacheWidth));
}

fn decodeId(texel: vec4f) -> u32 {
    let bytes = vec4u(round(texel * 255.0));
    return bytes.x | (bytes.y << 8u) | (bytes.z << 16u) | (bytes.w << 24u);
}

// the centre's ndc, decoded as the splat shader decodes it
fn centreNdc(packed: u32) -> vec2f {
    let viewport = vec2f(f32(uniforms.width), f32(uniforms.height));
    let maxRadius = min(1024.0, min(viewport.x, viewport.y));
    let ndcRange = vec2f(1.0) + vec2f(4.0 * maxRadius) / viewport;
    return unpack2x16snorm(packed) * ndcRange;
}

// the order the id pass's depth test keeps (see the splat shader's ID_PASS):
// squared distance to the camera with a radial sort, else view depth
fn orderKey(a: vec4u) -> f32 {
    let depth = bitcast<f32>(a.y);
    if (uniforms.radial == 0u) {
        return depth;
    }
    let lateral = centreNdc(a.x) / vec2f(uniforms.projX, uniforms.projY);
    return depth * depth * (1.0 + dot(lateral, lateral));
}

// whether the gaussian at this order key is reached at the pixel
fn reached(pixel: vec2i, entry: u32, key: f32) -> bool {
    let id = decodeId(textureLoad(idTexture, pixel, 0));
    if (id == uniforms.idNone) {
        return true;
    }
    let owner = id + uniforms.idOffset;
    if (owner == entry || owner >= uniforms.capacity) {
        return true;
    }
    return orderKey(textureLoad(cacheA, cacheUv(owner), 0)) >= key;
}

@compute @workgroup_size(256)
fn main(
    @builtin(global_invocation_id) gid: vec3u,
    @builtin(num_workgroups) numWorkgroups: vec3u
) {
    // the dispatch is split into rows once it exceeds the per-dimension limit.
    // Survivors fill the compact list from the front, the culled tail from the
    // back
    let index = gid.y * numWorkgroups.x * 256u + gid.x;
    let survivors = splatCounter[0];
    var entry: u32;
    if (index < survivors) {
        entry = compactEntries[index];
    } else if (index - survivors < splatCounter[1]) {
        entry = compactEntries[uniforms.capacity - 1u - (index - survivors)];
    } else {
        return;
    }
    if (entry < uniforms.rangeBase || entry >= uniforms.rangeBase + uniforms.rangeCount) {
        return;
    }
    let uv = cacheUv(entry);
    let a = textureLoad(cacheA, uv, 0);
    let b = textureLoad(cacheB, uv, 0).x;
    // locked gaussians get no marker and are never picked
    if (((b >> 24u) & 2u) != 0u) {
        return;
    }

    // the centre and axes in target pixels, decoded and clamped as the id pass
    // draws them (see the splat shader)
    let viewport = vec2f(f32(uniforms.width), f32(uniforms.height));
    let ndc = centreNdc(a.x);
    let centre = vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5) * viewport;
    var axis1 = unpack2x16float(a.w);
    var axis2 = unpack2x16float(b).x * normalize(vec2f(axis1.y, -axis1.x));
    axis1 *= max(1.0, 1.0 / max(length(axis1), 1e-6));
    axis2 *= max(1.0, 1.0 / max(length(axis2), 1e-6));
    let key = orderKey(a);
    // the falloff's shape only: the share is a ratio, so opacity cancels, and
    // a zero-opacity gaussian is still weighed by where its footprint lies
    let shape = max(decodeSplatAlpha((b >> 16u) & 0xffu), 1.0);

    var total = 0.0;
    var shown = 0.0;
    for (var k = 0u; k < SAMPLES; k++) {
        // a sunflower spiral over the unit disc: equal area per point
        let r2 = (f32(k) + 0.5) / f32(SAMPLES);
        let angle = f32(k) * GOLDEN_ANGLE;
        let u = sqrt(r2) * vec2f(cos(angle), sin(angle));
        let offset = u.x * axis1 + u.y * axis2;
        let pixel = vec2i(floor(centre + vec2f(offset.x, -offset.y)));
        if (pixel.x < 0 || pixel.y < 0 || pixel.x >= i32(uniforms.width) || pixel.y >= i32(uniforms.height)) {
            continue;
        }
        let weight = splatAlpha(r2, shape);
        total += weight;
        if (reached(pixel, entry, key)) {
            shown += weight;
        }
    }
    if (total > 0.0 && shown >= uniforms.cutoff * total) {
        atomicOr(&visible[entry >> 5u], 1u << (entry & 31u));
    }
}
`;

export { projectedSplatVisibility, projectedSplatVisibilityTail, projectedSplatVisibilitySample };
