// shared GLSL chunk used by histogram and select-by-range GPU passes.
//
// declares the texture and uniform interface for reading per-splat data and
// computing a single scalar value selected by `propMode`. exposes a small
// extractor API (`Splat` struct + `readSplat`, `readColorDC`, `readOpacity`,
// `readScale`, `readRotation`, `readSHCoeff`, `readFinalColor`) so callers can
// also pull individual fields if they need something other than the propMode
// dispatch.
//
// propMode values:
//
//   0..2   world.x / world.y / world.z
//   3      distance (= length(world))
//   4      camera depth (= -(viewMatrix * world).z)
//   5..7   "Red"/"Green"/"Blue" = final on-screen color channels.
//          applyColorGrade(dcDecode(f_dc) + evalSH(viewDir)). view-dependent.
//   8      opacity (= splatColor.a * transparency)
//   9..11  scale_0 / scale_1 / scale_2 (exp'd in transformB.xyz)
//   12     volume (= scale.x * scale.y * scale.z)
//   13     surface area (= dot(scale, scale))
//   14..17 quat W (reconstructed, always >= 0) / X / Y / Z
//   18..20 H / S / V of the final on-screen color (same dependence as 5..7)
//   21..   f_rest_N (N = propMode - 21), decoded from the engine's packed SH
//          textures. only valid when SH_BANDS > 0 and N < 3 * shNumCoeffs.
//   66..68 raw "DC R"/"DC G"/"DC B" coefficients: inverse of `dcDecode` applied
//          to `splatColor.rgb`. camera-independent.
//
// the active SH_BANDS define controls which SH samplers are declared and which
// branches are compiled in. callers must select a matching uniqueName so that
// each SH_BANDS variant gets its own cached shader.

const computeSplatValueGLSL = /* glsl */ `

#ifndef SH_BANDS
#define SH_BANDS 0
#endif

#define SH_C0 0.28209479177387814

#if SH_BANDS == 1
#define SH_COEFFS 3
#elif SH_BANDS == 2
#define SH_COEFFS 8
#elif SH_BANDS == 3
#define SH_COEFFS 15
#endif

uniform highp usampler2D transformA;
uniform sampler2D transformB;
uniform sampler2D splatColor;
uniform highp usampler2D splatTransform;
uniform sampler2D transformPalette;
uniform sampler2D splatState;

#if SH_BANDS > 0
uniform highp usampler2D splatSH_1to3;
uniform int shNumCoeffs;
#endif
#if SH_BANDS > 1
uniform highp usampler2D splatSH_4to7;
uniform highp usampler2D splatSH_8to11;
#endif
#if SH_BANDS > 2
uniform highp usampler2D splatSH_12to15;
#endif

uniform ivec2 splat_params;
uniform int propMode;
uniform mat4 entityMatrix;
uniform mat4 viewMatrix;
uniform mat4 viewProjection;
uniform vec3 cameraWorldPos;
uniform int onScreenOnly;

uniform vec3 cgScale;
uniform float cgOffset;
uniform float cgSaturation;
uniform float transparency;

// SH band weighting constants (matches engine's gsplatEvalSH GLSL chunk).
#if SH_BANDS > 0
const float SH_C1 = 0.4886025119029199;
#if SH_BANDS > 1
const float SH_C2_0 =  1.0925484305920792;
const float SH_C2_1 = -1.0925484305920792;
const float SH_C2_2 =  0.31539156525252005;
const float SH_C2_3 = -1.0925484305920792;
const float SH_C2_4 =  0.5462742152960396;
#endif
#if SH_BANDS > 2
const float SH_C3_0 = -0.5900435899266435;
const float SH_C3_1 =  2.890611442640554;
const float SH_C3_2 = -0.4570457994644658;
const float SH_C3_3 =  0.3731763325901154;
const float SH_C3_4 = -0.4570457994644658;
const float SH_C3_5 =  1.445305721320277;
const float SH_C3_6 = -0.5900435899266435;
#endif
#endif

struct Splat {
    int idx;
    ivec2 uv;
    int state;
    bool selected;      // state == 1
    bool valid;         // state == 0 || state == 1 (not locked / deleted)
    vec3 localPos;      // pre-transform (from transformA)
    vec3 worldPos;      // post entity + per-splat transform
    bool visible;       // passes the onScreenOnly filter
};

vec3 applyColorGrade(vec3 c) {
    c = cgOffset + c * cgScale;
    float grey = dot(c, vec3(0.299, 0.587, 0.114));
    return mix(vec3(grey), c, cgSaturation);
}

vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

#if SH_BANDS > 0
// unpack the (R, G, B) SH triplet at coefficient index coeffIdx (0..14) for
// the splat at uv. R/B are stored in 11 bits, G in 10 bits, all per-splat
// normalized by the max value packed into splatSH_1to3.x.
vec3 unpackSHTriplet(int coeffIdx, ivec2 uv) {
    uvec4 sh1 = texelFetch(splatSH_1to3, uv, 0);
    float maxV = uintBitsToFloat(sh1.x);

    uint packed = 0u;
    if (coeffIdx < 3) {
        packed = sh1[coeffIdx + 1];
    }
    #if SH_BANDS > 1
    else if (coeffIdx < 7) {
        packed = texelFetch(splatSH_4to7, uv, 0)[coeffIdx - 3];
    }
    else if (coeffIdx < 11) {
        packed = texelFetch(splatSH_8to11, uv, 0)[coeffIdx - 7];
    }
    #endif
    #if SH_BANDS > 2
    else if (coeffIdx < 15) {
        packed = texelFetch(splatSH_12to15, uv, 0)[coeffIdx - 11];
    }
    #endif

    uint encR = (packed >> 21) & 0x7FFu;
    uint encG = (packed >> 11) & 0x3FFu;
    uint encB =  packed        & 0x7FFu;

    vec3 normalized = vec3(
        (float(encR) / 2047.0) * 2.0 - 1.0,
        (float(encG) / 1023.0) * 2.0 - 1.0,
        (float(encB) / 2047.0) * 2.0 - 1.0
    );

    return normalized * maxV;
}
#endif

// populate s from the given index. returns false when the splat is
// out-of-bounds or in a locked / deleted state; in that case only idx, state,
// valid, and selected are reliably set.
bool readSplat(int idx, out Splat s) {
    s.idx = idx;
    s.uv = ivec2(0);
    s.state = 0;
    s.selected = false;
    s.valid = false;
    s.localPos = vec3(0.0);
    s.worldPos = vec3(0.0);
    s.visible = false;

    if (idx >= splat_params.y) return false;
    s.uv = ivec2(idx % splat_params.x, idx / splat_params.x);

    s.state = int(texelFetch(splatState, s.uv, 0).r * 255.0 + 0.5);
    s.selected = (s.state == 1);
    bool clean = (s.state == 0);
    if (!(s.selected || clean)) return false;
    s.valid = true;

    uvec4 transformAData = texelFetch(transformA, s.uv, 0);
    s.localPos = uintBitsToFloat(transformAData.xyz);

    vec3 pos = s.localPos;
    uint ti = texelFetch(splatTransform, s.uv, 0).r;
    if (ti > 0u) {
        int u = int(ti % 512u) * 3;
        int v = int(ti / 512u);
        mat3x4 t;
        t[0] = texelFetch(transformPalette, ivec2(u,     v), 0);
        t[1] = texelFetch(transformPalette, ivec2(u + 1, v), 0);
        t[2] = texelFetch(transformPalette, ivec2(u + 2, v), 0);
        pos = vec4(s.localPos, 1.0) * t;
    }

    s.worldPos = (entityMatrix * vec4(pos, 1.0)).xyz;

    s.visible = true;
    if (onScreenOnly == 1) {
        vec4 clip = viewProjection * vec4(s.worldPos, 1.0);
        if (clip.w <= 0.0) {
            s.visible = false;
        } else {
            // OpenGL-style clip space: ndc in [-1, 1] on all axes.
            vec3 ndc = clip.xyz / clip.w;
            if (any(greaterThan(abs(ndc), vec3(1.0)))) {
                s.visible = false;
            }
        }
    }

    return true;
}

// color-graded DC color (no SH contribution). this is what was historically
// returned for the "Red"/"Green"/"Blue" propModes, now exposed as a building
// block.
vec3 readColorDC(Splat s) {
    return applyColorGrade(texelFetch(splatColor, s.uv, 0).rgb);
}

// post-grade alpha = sigmoid(opacity) * transparency.
float readOpacity(Splat s) {
    return texelFetch(splatColor, s.uv, 0).a * transparency;
}

// exponentiated scale per axis.
vec3 readScale(Splat s) {
    return texelFetch(transformB, s.uv, 0).xyz;
}

// quaternion components as (W, X, Y, Z). W is reconstructed and always >= 0
// because the engine canonicalises rotation signs during splat construction.
vec4 readRotation(Splat s) {
    vec2 qxy = unpackHalf2x16(texelFetch(transformA, s.uv, 0).w);
    float qz = texelFetch(transformB, s.uv, 0).w;
    float qw = sqrt(max(0.0, 1.0 - qxy.x * qxy.x - qxy.y * qxy.y - qz * qz));
    return vec4(qw, qxy.x, qxy.y, qz);
}

#if SH_BANDS > 0
// returns the single-channel f_rest value at the given index (0..44 for
// shBands 3). identical layout to getSHData in the engine.
float readSHCoeff(Splat s, int fRestIdx) {
    int channel = fRestIdx / shNumCoeffs;
    int coeffIdx = fRestIdx % shNumCoeffs;
    vec3 triplet = unpackSHTriplet(coeffIdx, s.uv);
    if (channel == 0) return triplet.r;
    if (channel == 1) return triplet.g;
    return triplet.b;
}
#endif

// final on-screen color: dcDecode(f_dc) + evalSH(viewDir), then ColorGrade.
// view-dependent. for shBands == 0 this collapses to the DC-only color.
vec3 readFinalColor(Splat s) {
    vec3 color = texelFetch(splatColor, s.uv, 0).rgb;

    #if SH_BANDS > 0
    vec3 dir = normalize(s.worldPos - cameraWorldPos);
    float x = dir.x;
    float y = dir.y;
    float z = dir.z;

    vec3 sh0 = unpackSHTriplet(0, s.uv);
    vec3 sh1 = unpackSHTriplet(1, s.uv);
    vec3 sh2 = unpackSHTriplet(2, s.uv);
    color += SH_C1 * (-sh0 * y + sh1 * z - sh2 * x);

    #if SH_BANDS > 1
    float xx = x * x;
    float yy = y * y;
    float zz = z * z;
    float xy = x * y;
    float yz = y * z;
    float xz = x * z;

    vec3 sh3 = unpackSHTriplet(3, s.uv);
    vec3 sh4 = unpackSHTriplet(4, s.uv);
    vec3 sh5 = unpackSHTriplet(5, s.uv);
    vec3 sh6 = unpackSHTriplet(6, s.uv);
    vec3 sh7 = unpackSHTriplet(7, s.uv);
    color +=
        sh3 * (SH_C2_0 * xy) +
        sh4 * (SH_C2_1 * yz) +
        sh5 * (SH_C2_2 * (2.0 * zz - xx - yy)) +
        sh6 * (SH_C2_3 * xz) +
        sh7 * (SH_C2_4 * (xx - yy));
    #endif

    #if SH_BANDS > 2
    vec3 sh8  = unpackSHTriplet(8,  s.uv);
    vec3 sh9  = unpackSHTriplet(9,  s.uv);
    vec3 sh10 = unpackSHTriplet(10, s.uv);
    vec3 sh11 = unpackSHTriplet(11, s.uv);
    vec3 sh12 = unpackSHTriplet(12, s.uv);
    vec3 sh13 = unpackSHTriplet(13, s.uv);
    vec3 sh14 = unpackSHTriplet(14, s.uv);
    color +=
        sh8  * (SH_C3_0 * y * (3.0 * xx - yy)) +
        sh9  * (SH_C3_1 * xy * z) +
        sh10 * (SH_C3_2 * y * (4.0 * zz - xx - yy)) +
        sh11 * (SH_C3_3 * z * (2.0 * zz - 3.0 * xx - 3.0 * yy)) +
        sh12 * (SH_C3_4 * x * (4.0 * zz - xx - yy)) +
        sh13 * (SH_C3_5 * z * (xx - yy)) +
        sh14 * (SH_C3_6 * x * (xx - 3.0 * yy));
    #endif
    #endif

    return applyColorGrade(color);
}

// computes the scalar value for the splat at the given index. out-params
// receive the value, whether the splat is selected, and whether it passes the
// onScreenOnly filter (always true when onScreenOnly == 0).
bool computeSplatValue(int idx, out float value, out bool selected, out bool visible) {
    value = 0.0;
    Splat s;
    if (!readSplat(idx, s)) {
        selected = false;
        visible = false;
        return false;
    }
    selected = s.selected;
    visible = s.visible;

    if (propMode == 0)        value = s.worldPos.x;
    else if (propMode == 1)   value = s.worldPos.y;
    else if (propMode == 2)   value = s.worldPos.z;
    else if (propMode == 3)   value = length(s.worldPos);
    else if (propMode == 4)   value = -(viewMatrix * vec4(s.worldPos, 1.0)).z;
    else if (propMode == 5 || propMode == 6 || propMode == 7) {
        vec3 rgb = readFinalColor(s);
        if (propMode == 5)       value = rgb.r;
        else if (propMode == 6)  value = rgb.g;
        else                     value = rgb.b;
    }
    else if (propMode == 8) {
        value = readOpacity(s);
    }
    else if (propMode >= 9 && propMode <= 13) {
        vec3 sc = readScale(s);
        if (propMode == 9)       value = sc.x;
        else if (propMode == 10) value = sc.y;
        else if (propMode == 11) value = sc.z;
        else if (propMode == 12) value = sc.x * sc.y * sc.z;
        else                     value = dot(sc, sc);
    }
    else if (propMode >= 14 && propMode <= 17) {
        vec4 q = readRotation(s);
        if (propMode == 14)      value = q.x;     // W
        else if (propMode == 15) value = q.y;     // X
        else if (propMode == 16) value = q.z;     // Y
        else                     value = q.w;     // Z
    }
    else if (propMode == 18 || propMode == 19 || propMode == 20) {
        // rgb2hsv expects channels in [0, 1]; the renderer clamps the final
        // pixel at output, so HSV is well-defined only on the clamped color.
        // without this, unclamped HDR / SH-shifted channels yield nonsense
        // S/V (e.g. (max - min)/max blowing up when max ≈ 0).
        vec3 hsv = rgb2hsv(clamp(readFinalColor(s), 0.0, 1.0));
        if (propMode == 18)      value = hsv.x * 360.0;
        else if (propMode == 19) value = hsv.y;
        else                     value = hsv.z;
    }
    #if SH_BANDS > 0
    else if (propMode >= 21 && propMode <= 65) {
        value = readSHCoeff(s, propMode - 21);
    }
    #endif
    else if (propMode >= 66 && propMode <= 68) {
        // raw f_dc_N coefficient: invert the engine's dcDecode.
        vec3 dc = texelFetch(splatColor, s.uv, 0).rgb;
        float c;
        if (propMode == 66)      c = dc.r;
        else if (propMode == 67) c = dc.g;
        else                     c = dc.b;
        value = (c - 0.5) / SH_C0;
    }

    return true;
}
`;

export { computeSplatValueGLSL };
