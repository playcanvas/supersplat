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

export { projectedSplatVisibility, projectedSplatVisibilityTail };
