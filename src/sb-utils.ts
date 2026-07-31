import {
    ADDRESS_CLAMP_TO_EDGE,
    FILTER_NEAREST,
    PIXELFORMAT_RGBA32F,
    GraphicsDevice,
    GSplatData,
    Quat,
    Texture,
    Vec3
} from 'playcanvas';

// Spherical Beta (SB) view-dependent color, from Deformable Beta Splatting
// (Liu et al., SIGGRAPH 2025, https://rongliu-leo.github.io/beta-splatting/).
// Trainers that support it write the lobes to ply as `sb_params_*` columns,
// which is what this module reads and writes.
//
// Each splat carries up to SB_MAX_LOBES anisotropic lobes which are *added* to
// the SH/DC color, leaving the SH bands themselves untouched:
//
//   C += sum_l pow(max(dot(dir, lobeDir_l), 0), 4 * exp(beta_l)) * softplus(rgb_l)
//
// A lobe is 6 raw (pre-activation) floats [r, g, b, theta, phi, beta], where
// lobeDir = (sin(theta)cos(phi), sin(theta)sin(phi), cos(theta)).
//
// PLY stores the lobes channel-major, matching the reference implementation:
// column index = channel * lobes + lobe. So for 4 lobes, `sb_params_0..3` are
// the per-lobe red values, `4..7` green, and so on to `20..23` for beta.

/** Channels per lobe: r, g, b, theta, phi, beta. */
const SB_CHANNELS = 6;

/**
 * Maximum lobe count handled here. A practical cap rather than a limit of the
 * model: it bounds both the shader's loop and the atlas size. Files carrying
 * more are rejected by calcSBLobes rather than partially read.
 */
const SB_MAX_LOBES = 8;

/** RGBA texels per lobe in the GPU atlas: (r,g,b,theta) then (phi,beta,-,-). */
const SB_TEXELS_PER_LOBE = 2;

/**
 * Raw lobe color that activates to (near) zero, i.e. a lobe contributing
 * nothing. Note 0 is *not* neutral: softplus(0) is ~0.1, so padding absent
 * lobes with zeros would inject a visible specular term.
 */
const SB_NEUTRAL_RGB = -10;

/** Softplus sharpness used by the reference model: log(2) * 10. */
const SB_SOFTPLUS_B = 6.931471805599453;

/** Activate a raw lobe color channel. Must match evalSB in splat-shader.ts. */
const sbSoftplus = (x: number) => {
    const bx = SB_SOFTPLUS_B * x;
    // softplus(x) -> x once b*x is large; guards exp() from overflowing
    return (bx > 20 ? bx : Math.log(1 + Math.exp(bx))) / SB_SOFTPLUS_B;
};

/** Inverse of {@link sbSoftplus}. Non-positive input has no raw preimage. */
const sbInvSoftplus = (y: number) => {
    if (y <= 0) {
        return SB_NEUTRAL_RGB;
    }
    const by = SB_SOFTPLUS_B * y;
    return by > 20 ? y : Math.log(Math.exp(by) - 1) / SB_SOFTPLUS_B;
};

/** PLY column name for a given channel/lobe pair, channel-major. */
const sbColumnName = (channel: number, lobe: number, lobes: number) => `sb_params_${channel * lobes + lobe}`;

/** All PLY column names for `lobes` lobes, in storage order. */
const sbColumnNames = (lobes: number) => Array.from({ length: lobes * SB_CHANNELS }, (_, i) => `sb_params_${i}`);

/**
 * Detect the lobe count from the available property names. Returns 0 when
 * there is no usable SB data - absent, a partial lobe, or more lobes than
 * supported - in which case callers skip SB entirely.
 */
const calcSBLobes = (has: (name: string) => boolean) => {
    // probe one lobe beyond the limit so an unsupported count is rejected rather
    // than clipped: the columns are channel-major, so reading only the first
    // SB_MAX_LOBES lobes' worth of a longer run would misread green as red
    const limit = (SB_MAX_LOBES + 1) * SB_CHANNELS;

    let count = 0;
    while (count < limit && has(`sb_params_${count}`)) {
        count++;
    }

    return (count > 0 && count < limit && count % SB_CHANNELS === 0) ? count / SB_CHANNELS : 0;
};

/** The per-splat lobe atlas and what the shader needs to address it. */
type SBAtlas = {
    texture: Texture;
    width: number;
    lobes: number;
};

/**
 * Build the per-splat lobe atlas sampled by the splat vertex shader.
 *
 * Layout is SB_TEXELS_PER_LOBE RGBA32F texels per lobe, addressed by
 * `splat.index` (which the engine derives from the same per-splat ordering as
 * the state and transform textures):
 *
 *   texel 2l + 0 = (r, g, b, theta)
 *   texel 2l + 1 = (phi, beta, unused, unused)
 *
 * The two unused floats per lobe buy index math that needs no division.
 * Dimensions are chosen independently of the engine's splat texture size, so
 * the shader is passed the atlas width to reconstruct texel coordinates.
 *
 * Returns null when there is no SB data, or it cannot fit in a texture.
 */
const createSBAtlas = (device: GraphicsDevice, splatData: GSplatData): SBAtlas => {
    const lobes = calcSBLobes(name => !!splatData.getProp(name));
    const numSplats = splatData.numSplats;

    if (lobes === 0) {
        // say why the lobes aren't showing up, rather than failing silently
        if (splatData.getProp('sb_params_0')) {
            console.warn(`spherical beta: sb_params_* count is not a whole number of lobes (max ${SB_MAX_LOBES}), ignoring SB data`);
        }
        return null;
    }

    if (numSplats === 0) {
        return null;
    }

    const texelsPerSplat = lobes * SB_TEXELS_PER_LOBE;
    const numTexels = numSplats * texelsPerSplat;
    const maxDim = device.maxTextureSize;
    const width = Math.min(numTexels, maxDim);
    const height = Math.ceil(numTexels / width);

    if (height > maxDim) {
        console.warn(`spherical beta: ${numSplats} splats x ${lobes} lobes exceeds the maximum texture size, ignoring SB data`);
        return null;
    }

    const texture = new Texture(device, {
        name: 'splatSB',
        width,
        height,
        format: PIXELFORMAT_RGBA32F,
        mipmaps: false,
        minFilter: FILTER_NEAREST,
        magFilter: FILTER_NEAREST,
        addressU: ADDRESS_CLAMP_TO_EDGE,
        addressV: ADDRESS_CLAMP_TO_EDGE
    });

    // interleave the channel-major source columns, one lobe at a time
    const data = texture.lock() as Float32Array;
    const stride = texelsPerSplat * 4;

    for (let l = 0; l < lobes; ++l) {
        const columns = Array.from({ length: SB_CHANNELS },
            (_, c) => splatData.getProp(sbColumnName(c, l, lobes)) as Float32Array);

        let o = l * SB_TEXELS_PER_LOBE * 4;
        for (let i = 0; i < numSplats; ++i, o += stride) {
            for (let c = 0; c < SB_CHANNELS; ++c) {
                data[o + c] = columns[c][i];
            }
        }
    }

    texture.unlock();

    return { texture, width, lobes };
};

const tmpVec = new Vec3();

/**
 * Rotate a lobe direction by `quat`, returning the rotated spherical angles.
 * The SB analogue of rotating SH coefficients when baking a transform, but far
 * cheaper: a lobe is just a direction, so the rotation applies to it directly.
 */
const rotateSBLobe = (quat: Quat, theta: number, phi: number, result: { theta: number, phi: number }) => {
    const sinTheta = Math.sin(theta);
    tmpVec.set(sinTheta * Math.cos(phi), sinTheta * Math.sin(phi), Math.cos(theta));
    quat.transformVector(tmpVec, tmpVec);

    result.theta = Math.acos(Math.max(-1, Math.min(1, tmpVec.z)));
    result.phi = Math.atan2(tmpVec.y, tmpVec.x);
};

export {
    SB_NEUTRAL_RGB,
    calcSBLobes,
    createSBAtlas,
    rotateSBLobe,
    sbColumnName,
    sbColumnNames,
    sbInvSoftplus,
    sbSoftplus
};
export type { SBAtlas };
