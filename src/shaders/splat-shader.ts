const vertexShader = /* glsl*/`
#include "gsplatCommonVS"

uniform sampler2D splatState;

uniform vec4 selectedClr;
uniform vec4 lockedClr;
uniform vec4 outlierClr;

uniform vec3 clrOffset;
uniform vec4 clrScale;

// depth visualization uniforms
uniform int depthVisualization;
uniform float depthMin;
uniform float depthMax;
uniform int depthReverse;
uniform int depthXMode;
uniform int depthYMode;
uniform int depthZMode;
uniform float depthBlend;
uniform int depthColorRamp; // 0=grayscale, 1=viridis, 2=plasma, 3=inferno, 4=turbo, 5=jet, 6=custom
uniform sampler2D customColorTexture; // 1D texture for custom color scheme
uniform int hasCustomColorScheme; // 0=no custom scheme, 1=has custom scheme

varying mediump vec3 texCoordIsLocked;          // store locked flat in z
varying mediump vec4 color;
varying mediump float viewDepth;                // depth in view space

#if PICK_PASS
    uniform uint pickMode;                      // 0: add, 1: remove, 2: set
#endif

mediump vec4 discardVec = vec4(0.0, 0.0, 2.0, 1.0);

uniform float saturation;
uniform float splatSize;

vec3 applySaturation(vec3 color) {
    vec3 grey = vec3(dot(color, vec3(0.299, 0.587, 0.114)));
    return grey + (color - grey) * saturation;
}

// Color ramp functions for depth visualization
vec3 viridis(float t) {
    const vec3 c0 = vec3(0.2777273, 0.0052783, 0.3316909);
    const vec3 c1 = vec3(0.1050930, 1.4040960, 0.2043850);
    const vec3 c2 = vec3(-0.3308618, 0.2145140, 1.1239070);
    const vec3 c3 = vec3(-4.6340690, -5.7998060, -19.3348440);
    const vec3 c4 = vec3(6.2289120, 14.1791960, 56.6953780);
    const vec3 c5 = vec3(4.7767370, -13.7452020, -65.3531610);
    const vec3 c6 = vec3(-5.4356700, 4.6450700, 26.3124390);
    
    t = clamp(t, 0.0, 1.0);
    return c0 + t*(c1 + t*(c2 + t*(c3 + t*(c4 + t*(c5 + t*c6)))));
}

vec3 plasma(float t) {
    const vec3 c0 = vec3(0.0585208, 0.0323289, 0.5273100);
    const vec3 c1 = vec3(0.3328530, 0.7781420, 0.8736040);
    const vec3 c2 = vec3(-0.3322410, -0.1366890, -1.7184720);
    const vec3 c3 = vec3(-4.6424300, -2.2620800, -0.8968210);
    const vec3 c4 = vec3(2.9212100, 8.9642600, 3.0119200);
    const vec3 c5 = vec3(2.2451100, -18.4747300, -5.2737900);
    const vec3 c6 = vec3(-5.1948000, 8.4228100, 5.3846000);
    
    t = clamp(t, 0.0, 1.0);
    return c0 + t*(c1 + t*(c2 + t*(c3 + t*(c4 + t*(c5 + t*c6)))));
}

vec3 inferno(float t) {
    const vec3 c0 = vec3(0.0002189, 0.0013130, 0.0141700);
    const vec3 c1 = vec3(0.1065400, 0.5668440, 1.3932990);
    const vec3 c2 = vec3(11.6023100, -3.9724510, -15.9423300);
    const vec3 c3 = vec3(-41.7035350, 17.4381280, 44.3619810);
    const vec3 c4 = vec3(77.1625850, -56.1648330, -65.1068280);
    const vec3 c5 = vec3(-71.3175700, 61.2160200, 51.4895040);
    const vec3 c6 = vec3(25.1307400, -20.4738850, -13.7077050);
    
    t = clamp(t, 0.0, 1.0);
    return c0 + t*(c1 + t*(c2 + t*(c3 + t*(c4 + t*(c5 + t*c6)))));
}

vec3 turbo(float t) {
    const vec3 c0 = vec3(0.1140890, 0.0622070, 0.7575950);
    const vec3 c1 = vec3(6.7159360, 5.1715420, -8.6936720);
    const vec3 c2 = vec3(-66.0934530, -43.9741570, 52.1793450);
    const vec3 c3 = vec3(228.6411900, 150.0471500, -85.8961940);
    const vec3 c4 = vec3(-334.1838400, -233.1776100, 67.5275460);
    const vec3 c5 = vec3(218.7637200, 158.7188200, -24.8729690);
    const vec3 c6 = vec3(-52.8813800, -40.4414800, 4.4760300);
    
    t = clamp(t, 0.0, 1.0);
    return c0 + t*(c1 + t*(c2 + t*(c3 + t*(c4 + t*(c5 + t*c6)))));
}

vec3 jet(float t) {
    t = clamp(t, 0.0, 1.0);
    if (t < 0.125) {
        return vec3(0.0, 0.0, 4.0 * t + 0.5);
    } else if (t < 0.375) {
        return vec3(0.0, 4.0 * (t - 0.125), 1.0);
    } else if (t < 0.625) {
        return vec3(4.0 * (t - 0.375), 1.0, 1.0 - 4.0 * (t - 0.375));
    } else if (t < 0.875) {
        return vec3(1.0, 1.0 - 4.0 * (t - 0.625), 0.0);
    } else {
        return vec3(1.0 - 4.0 * (t - 0.875), 0.0, 0.0);
    }
}

vec3 applyColorRamp(float t, int rampType) {
    if (rampType == 6 && hasCustomColorScheme == 1) {
        // Use custom color scheme from texture
        return texture2D(customColorTexture, vec2(clamp(t, 0.0, 1.0), 0.5)).rgb;
    } else if (rampType == 1) {
        return viridis(t);
    } else if (rampType == 2) {
        return plasma(t);
    } else if (rampType == 3) {
        return inferno(t);
    } else if (rampType == 4) {
        return turbo(t);
    } else if (rampType == 5) {
        return jet(t);
    } else {
        // Default grayscale
        return vec3(t);
    }
}

void main(void) {
    // read gaussian details
    SplatSource source;
    if (!initSource(source)) {
        gl_Position = discardVec;
        return;
    }

    // get per-gaussian edit state, discard if deleted
    uint vertexState = uint(texelFetch(splatState, source.uv, 0).r * 255.0 + 0.5) & 15u;

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
            // add: skip deleted, locked, selected and outlier splats
            if (vertexState != 0u) {
                gl_Position = discardVec;
                return;
            }
        } else if (pickMode == 1u) {
            // remove: skip deleted, locked, outlier and unselected splats
            if (vertexState != 1u) {
                gl_Position = discardVec;
                return;
            }
        } else {
            // set: skip deleted, locked and outlier splats
            if ((vertexState & 14u) != 0u) {
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

    gl_Position = center.proj + vec4(corner.offset * splatSize, 0.0, 0.0);

    // store texture coord and locked state
    texCoordIsLocked = vec3(corner.uv, (vertexState & 2u) != 0u ? 1.0 : 0.0);
    
    // store depth for depth visualization (coordinate mode or view depth)
    if (depthXMode == 1) {
        viewDepth = modelCenter.x;
    } else if (depthYMode == 1) {
        viewDepth = modelCenter.y;
    } else if (depthZMode == 1) {
        viewDepth = modelCenter.z;
    } else {
        viewDepth = -center.view.z;  // Default: view depth (camera distance)
    }

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

        // evaluate spherical harmonics
        #if SH_BANDS > 0
        // calculate the model-space view direction
            vec3 dir = normalize(center.view * mat3(center.modelView));

            // read sh coefficients
            vec3 sh[SH_COEFFS];
            float scale;
            readSHData(source, sh, scale);

            // evaluate
            color.xyz += evalSH(sh, dir) * scale;
        #endif

        // apply tint/brightness
        color = color * clrScale + vec4(clrOffset, 0.0);

        // apply saturation
        color.xyz = applySaturation(color.xyz);

        // don't allow out-of-range alpha
        color.a = clamp(color.a, 0.0, 1.0);

        // apply tonemapping
        color = vec4(prepareOutputFromGamma(max(color.xyz, 0.0)), color.w);

        // apply state colors (outlier > locked > selected priority)
        if ((vertexState & 8u) != 0u) {
            // outlier - highest priority (SOR preview)
            color *= outlierClr;
        } else if ((vertexState & 2u) != 0u) {
            // locked - takes priority over selected
            color *= lockedClr;
        } else if ((vertexState & 1u) != 0u) {
            // selected - lowest priority
            color.xyz = mix(color.xyz, selectedClr.xyz * 0.8, selectedClr.a);
        }
        
        // apply depth visualization if enabled
        if (depthVisualization == 1) {
            float depthValue = viewDepth;  // Use the depth calculated in vertex shader
            
            float normalizedDepth = clamp((depthValue - depthMin) / (depthMax - depthMin), 0.0, 1.0);
            if (depthReverse == 1) {
                normalizedDepth = 1.0 - normalizedDepth;
            }
            
            // Apply selected color ramp
            vec3 depthColor = applyColorRamp(normalizedDepth, depthColorRamp);
            color.xyz = mix(color.xyz, depthColor, depthBlend);
        }
    
    #endif
}
`;

const fragmentShader = /* glsl*/`
varying mediump vec3 texCoordIsLocked;
varying mediump vec4 color;
varying mediump float viewDepth;

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

export { vertexShader, fragmentShader, gsplatCenter };
