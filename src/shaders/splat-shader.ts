const vertexShader = /* glsl*/`
#include "gsplatCommonVS"

uniform sampler2D splatState;
uniform highp usampler2D splatTransform;        // per-splat index into transform palette
uniform sampler2D transformPalette;             // palette of transform matrices

uniform vec4 selectedClr;
uniform vec4 lockedClr;

uniform vec3 clrOffset;
uniform vec4 clrScale;

varying mediump vec3 texCoordIsLocked;          // store locked flat in z
varying mediump vec4 color;

mediump vec4 discardVec = vec4(0.0, 0.0, 2.0, 1.0);

// calculate 2d covariance vectors
bool projectCenterCustom(SplatState state, vec3 center, out ProjectedState projState, in mat4 modelMat) {
    // project center to screen space
    mat4 model_view = matrix_view * modelMat;
    vec4 centerCam = model_view * vec4(center, 1.0);
    vec4 centerProj = matrix_projection * centerCam;
    if (centerProj.z < -centerProj.w) {
        return false;
    }

    // get covariance
    vec3 covA, covB;
    readCovariance(state, covA, covB);

    mat3 Vrk = mat3(
        covA.x, covA.y, covA.z, 
        covA.y, covB.x, covB.y,
        covA.z, covB.y, covB.z
    );

    float focal = viewport.x * matrix_projection[0][0];

    vec3 v = camera_params.w == 1.0 ? vec3(0.0, 0.0, 1.0) : centerCam.xyz;
    float J1 = focal / v.z;
    vec2 J2 = -J1 / v.z * v.xy;
    mat3 J = mat3(
        J1, 0.0, J2.x, 
        0.0, J1, J2.y, 
        0.0, 0.0, 0.0
    );

    mat3 W = transpose(mat3(model_view));
    mat3 T = W * J;
    mat3 cov = transpose(T) * Vrk * T;

    float diagonal1 = cov[0][0] + 0.3;
    float offDiagonal = cov[0][1];
    float diagonal2 = cov[1][1] + 0.3;

    float mid = 0.5 * (diagonal1 + diagonal2);
    float radius = length(vec2((diagonal1 - diagonal2) / 2.0, offDiagonal));
    float lambda1 = mid + radius;
    float lambda2 = max(mid - radius, 0.1);

    float l1 = 2.0 * min(sqrt(2.0 * lambda1), 1024.0);
    float l2 = 2.0 * min(sqrt(2.0 * lambda2), 1024.0);

    // early-out gaussians smaller than 2 pixels
    if (l1 < 2.0 && l2 < 2.0) {
        return false;
    }

    // perform clipping test against x/y
    if (any(greaterThan(abs(centerProj.xy) - vec2(l1, l2) / viewport * centerProj.w, centerProj.ww))) {
        return false;
    }

    vec2 diagonalVector = normalize(vec2(offDiagonal, lambda1 - diagonal1));
    vec2 v1 = l1 * diagonalVector;
    vec2 v2 = l2 * vec2(diagonalVector.y, -diagonalVector.x);

    projState.modelView = model_view;
    projState.centerCam = centerCam.xyz;
    projState.centerProj = centerProj;
    projState.cornerOffset = (state.cornerUV.x * v1 + state.cornerUV.y * v2) / viewport * centerProj.w;
    projState.cornerProj = centerProj + vec4(projState.cornerOffset, 0.0, 0.0);
    projState.cornerUV = state.cornerUV;

    return true;
}

mat4 applyPaletteTransform(SplatState state, mat4 model) {
    uint transformIndex = texelFetch(splatTransform, state.uv, 0).r;
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

void main(void) {
    // read gaussian details
    SplatState state;
    if (!initState(state)) {
        gl_Position = discardVec;
        return;
    }

    // get per-gaussian edit state, discard if deleted
    uint vertexState = uint(texelFetch(splatState, state.uv, 0).r * 255.0 + 0.5);

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
        if ((vertexState & 6u) != 0u) {
            gl_Position = discardVec;
            return;
        }
    #else
        if ((vertexState & 4u) != 0u) {
            gl_Position = discardVec;
            return;
        }
    #endif

    // get center
    vec3 center = readCenter(state);

    ProjectedState projState;
    if (!projectCenterCustom(state, center, projState, applyPaletteTransform(state, matrix_model))) {
        gl_Position = discardVec;
        return;
    }

    // ensure splats aren't clipped by front and back clipping planes
    gl_Position = projState.cornerProj;
    gl_Position.z = clamp(gl_Position.z, -abs(gl_Position.w), abs(gl_Position.w));

    // store texture coord and locked state
    texCoordIsLocked = vec3(state.cornerUV, (vertexState & 2u) != 0u ? 1.0 : 0.0);

    #if UNDERLAY_PASS
        color = readColor(state);
        color.xyz = mix(color.xyz, selectedClr.xyz * 0.2, selectedClr.a) * selectedClr.a;
    #elif PICK_PASS
        uvec3 bits = (uvec3(state.id) >> uvec3(0u, 8u, 16u)) & uvec3(255u);
        color = vec4(vec3(bits) / 255.0, readColor(state).a);
    // handle splat color
    #elif FORWARD_PASS
        // read color
        color = readColor(state);

        // evaluate spherical harmonics
        #if SH_BANDS > 0
            color.xyz = max(vec3(0.0), color.xyz + evalSH(state, projState));
        #endif

        // apply locked/selected colors
        if ((vertexState & 2u) != 0u) {
            // locked
            color *= lockedClr;
        } else if ((vertexState & 1u) != 0u) {
            // selected
            color.xyz = mix(color.xyz, selectedClr.xyz * 0.8, selectedClr.a);
        } else {
            // apply tint/brightness
            color = color * clrScale + vec4(clrOffset, 0.0);
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

    #if OUTLINE_PASS
        if (A > (mode == 0 ? 0.02 : 1.0)) {
            discard;
        }
        gl_FragColor = vec4(1.0);
    #else
        if (A > 1.0) {
            discard;
        }

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

            gl_FragColor = vec4(color.xyz, alpha);
        #endif
    #endif
}
`;

export { vertexShader, fragmentShader };
