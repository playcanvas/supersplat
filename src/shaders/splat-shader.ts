const vertexShader = /* glsl*/`
#include "gsplatCommonVS"

uniform sampler2D splatState;

uniform vec4 selectedClr;
uniform vec4 lockedClr;

uniform vec3 clrOffset;
uniform vec4 clrScale;

varying mediump vec3 texCoordIsLocked;          // store locked flat in z
varying mediump vec4 color;

#if PICK_PASS
    uniform uint pickMode;                      // 0: add, 1: remove, 2: set
#endif

mediump vec4 discardVec = vec4(0.0, 0.0, 2.0, 1.0);

void main(void) {
    // read gaussian details
    SplatSource source;
    if (!initSource(source)) {
        gl_Position = discardVec;
        return;
    }

    // get per-gaussian edit state, discard if deleted
    uint vertexState = uint(texelFetch(splatState, source.uv, 0).r * 255.0 + 0.5) & 7u;

    #if OUTLINE_PASS
        if (vertexState != 1u) {
            gl_Position = discardVec;
            return;
        }
    #elif UNDERLAY_PASS
        if (vertexState != 1u) {
            gl_Position = discardVec;
            return;
        }
    #elif PICK_PASS
        if (pickMode == 0u) {
            // add: skip deleted, hidden and selected splats
            if (vertexState != 0u) {
                gl_Position = discardVec;
                return;
            }
        } else if (pickMode == 1u) {
            // remove: skip deleted, hidden and unselected splats
            if (vertexState != 1u) {
                gl_Position = discardVec;
                return;
            }
        } else {
            // set: skip deleted and hidden splats
            if ((vertexState & 6u) != 0u) {
                gl_Position = discardVec;
                return;
            }
        }
    #else
        if ((vertexState & 4u) != 0u) {
            gl_Position = discardVec;
            return;
        }
    #endif

    // get center
    vec3 modelCenter = readCenter(source);

    SplatCenter center;
    if (!initCenter(source, modelCenter, center)) {
        gl_Position = discardVec;
        return;
    }

    SplatCorner corner;
    if (!initCorner(source, center, corner)) {
        gl_Position = discardVec;
        return;
    }

    gl_Position = center.proj + vec4(corner.offset, 0.0, 0.0);

    // store texture coord and locked state
    texCoordIsLocked = vec3(corner.uv, (vertexState & 2u) != 0u ? 1.0 : 0.0);

    #if UNDERLAY_PASS
        color = readColor(source);
        color.xyz = mix(color.xyz, selectedClr.xyz * 0.2, selectedClr.a) * selectedClr.a;
    #elif PICK_PASS
        uvec3 bits = (uvec3(source.id) >> uvec3(0u, 8u, 16u)) & uvec3(255u);
        color = vec4(vec3(bits) / 255.0, readColor(source).a);
    // handle splat color
    #elif FORWARD_PASS
        // read color
        color = readColor(source);
        color.xyz = applySaturation(color.xyz);

        // evaluate spherical harmonics
        #if SH_BANDS > 0
            vec3 dir = normalize(center.view * mat3(center.modelView));
            color.xyz += evalSH(source, dir);
        #endif

        // apply tint/brightness
        color = color * clrScale + vec4(clrOffset, 0.0);

        // don't allow out-of-range alpha
        color.a = clamp(color.a, 0.0, 1.0);

        // apply tonemapping
        color = vec4(prepareOutputFromGamma(max(color.xyz, 0.0)), color.w);

        // apply locked/selected colors
        if ((vertexState & 2u) != 0u) {
            // locked
            color *= lockedClr;
        } else if ((vertexState & 1u) != 0u) {
            // selected
            color.xyz = mix(color.xyz, selectedClr.xyz * 0.8, selectedClr.a);
        }
    
    #endif
}
`;

const fragmentShader = /* glsl*/`
varying mediump vec3 texCoordIsLocked;
varying mediump vec4 color;

uniform int mode;               // 0: centers, 1: rings
uniform float pickerAlpha;
uniform float ringSize;

void main(void) {
    mediump float A = dot(texCoordIsLocked.xy, texCoordIsLocked.xy);

    if (A > 1.0) {
        discard;
    }

    #if OUTLINE_PASS
        gl_FragColor = vec4(1.0, 1.0, 1.0, mode == 0 ? exp(-A * 4.0) * color.a : 1.0);
    #else
        mediump float alpha = exp(-A * 4.0) * color.a;

        #ifdef PICK_PASS
            if (alpha < pickerAlpha) {
                discard;
            }
            gl_FragColor = vec4(color.xyz, 0.0);
        #else
            if (texCoordIsLocked.z == 0.0 && ringSize > 0.0) {
                // rings mode
                if (A < 1.0 - ringSize) {
                    alpha = max(0.05, alpha);
                } else {
                    alpha = 0.6;
                }
            }

            gl_FragColor = vec4(color.xyz * alpha, alpha);
        #endif
    #endif
}
`;

const gsplatCenter = /* glsl*/`
uniform mat4 matrix_model;
uniform mat4 matrix_view;
uniform mat4 matrix_projection;

uniform highp usampler2D splatTransform;        // per-splat index into transform palette
uniform sampler2D transformPalette;             // palette of transform matrices

mat4 applyPaletteTransform(SplatSource source, mat4 model) {
    uint transformIndex = texelFetch(splatTransform, source.uv, 0).r;
    if (transformIndex == 0u) {
        return model;
    }

    // read transform matrix
    int u = int(transformIndex % 512u) * 3;
    int v = int(transformIndex / 512u);

    mat4 t;
    t[0] = texelFetch(transformPalette, ivec2(u, v), 0);
    t[1] = texelFetch(transformPalette, ivec2(u + 1, v), 0);
    t[2] = texelFetch(transformPalette, ivec2(u + 2, v), 0);
    t[3] = vec4(0.0, 0.0, 0.0, 1.0);

    return model * transpose(t);
}

// project the model space gaussian center to view and clip space
bool initCenter(SplatSource source, vec3 modelCenter, out SplatCenter center) {
    mat4 modelView = matrix_view * applyPaletteTransform(source, matrix_model);
    vec4 centerView = modelView * vec4(modelCenter, 1.0);

    // early out if splat is behind the camera
    if (centerView.z > 0.0) {
        return false;
    }

    vec4 centerProj = matrix_projection * centerView;

    // ensure gaussians are not clipped by camera near and far
    centerProj.z = clamp(centerProj.z, -abs(centerProj.w), abs(centerProj.w));

    center.view = centerView.xyz / centerView.w;
    center.proj = centerProj;
    center.projMat00 = matrix_projection[0][0];
    center.modelView = modelView;
    return true;
}
`;

const gsplatSH = /* glsl*/`

uniform float saturation;

vec3 applySaturation(vec3 color) {
    vec3 grey = vec3(dot(color, vec3(0.299, 0.587, 0.114)));
    return grey + (color - grey) * saturation;
}

#if SH_BANDS > 0

// unpack signed 11 10 11 bits
vec3 unpack111011s(uint bits) {
    return vec3((uvec3(bits) >> uvec3(21u, 11u, 0u)) & uvec3(0x7ffu, 0x3ffu, 0x7ffu)) / vec3(2047.0, 1023.0, 2047.0) * 2.0 - 1.0;
}

// fetch quantized spherical harmonic coefficients
void fetchScale(in uvec4 t, out float scale, out vec3 a, out vec3 b, out vec3 c) {
    scale = uintBitsToFloat(t.x);
    a = unpack111011s(t.y);
    b = unpack111011s(t.z);
    c = unpack111011s(t.w);
}

// fetch quantized spherical harmonic coefficients
void fetch(in uvec4 t, out vec3 a, out vec3 b, out vec3 c, out vec3 d) {
    a = unpack111011s(t.x);
    b = unpack111011s(t.y);
    c = unpack111011s(t.z);
    d = unpack111011s(t.w);
}

void fetch(in uint t, out vec3 a) {
    a = unpack111011s(t);
}

#if SH_BANDS == 1
    uniform highp usampler2D splatSH_1to3;
    void readSHData(in SplatSource source, out vec3 sh[3], out float scale) {
        fetchScale(texelFetch(splatSH_1to3, source.uv, 0), scale, sh[0], sh[1], sh[2]);
    }
#elif SH_BANDS == 2
    uniform highp usampler2D splatSH_1to3;
    uniform highp usampler2D splatSH_4to7;
    uniform highp usampler2D splatSH_8to11;
    void readSHData(in SplatSource source, out vec3 sh[8], out float scale) {
        fetchScale(texelFetch(splatSH_1to3, source.uv, 0), scale, sh[0], sh[1], sh[2]);
        fetch(texelFetch(splatSH_4to7, source.uv, 0), sh[3], sh[4], sh[5], sh[6]);
        fetch(texelFetch(splatSH_8to11, source.uv, 0).x, sh[7]);
    }
#else
    uniform highp usampler2D splatSH_1to3;
    uniform highp usampler2D splatSH_4to7;
    uniform highp usampler2D splatSH_8to11;
    uniform highp usampler2D splatSH_12to15;
    void readSHData(in SplatSource source, out vec3 sh[15], out float scale) {
        fetchScale(texelFetch(splatSH_1to3, source.uv, 0), scale, sh[0], sh[1], sh[2]);
        fetch(texelFetch(splatSH_4to7, source.uv, 0), sh[3], sh[4], sh[5], sh[6]);
        fetch(texelFetch(splatSH_8to11, source.uv, 0), sh[7], sh[8], sh[9], sh[10]);
        fetch(texelFetch(splatSH_12to15, source.uv, 0), sh[11], sh[12], sh[13], sh[14]);

        for (int i = 0; i < 15; i++) {
            sh[i] = applySaturation(sh[i]);
        }
    }
#endif

#endif
`;

export { vertexShader, fragmentShader, gsplatCenter, gsplatSH };
