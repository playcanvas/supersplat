
const vertexShader = /*glsl*/`
uniform vec3 view_position;
uniform bool ortho;

uniform sampler2D splatColor;
uniform sampler2D splatState;
uniform highp usampler2D splatTransform;        // per-splat index into transform palette
uniform sampler2D transformPalette;             // palette of transform matrices

uniform vec4 selectedClr;
uniform vec4 lockedClr;

uniform vec3 clrOffset;
uniform vec4 clrScale;

varying mediump vec3 texCoordIsLocked;          // store locked flat in z
varying mediump vec4 color;

#ifdef PICK_PASS
    flat varying highp uint vertexId;
#endif

mediump vec4 discardVec = vec4(0.0, 0.0, 2.0, 1.0);

void main(void)
{
    // calculate splat uv
    if (!calcSplatUV()) {
        gl_Position = discardVec;
        return;
    }

    // get vertex state, discard if deleted
    uint vertexState = uint(texelFetch(splatState, splatUV, 0).r * 255.0 + 0.5);

    #ifdef OUTLINE_PASS
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
    vec3 center = getCenter();

    mat4 model = matrix_model;

    // handle per-splat transform
    uint transformIndex = texelFetch(splatTransform, splatUV, 0).r;
    if (transformIndex > 0u) {
        // read transform matrix
        int u = int(transformIndex % 512u) * 3;
        int v = int(transformIndex / 512u);

        mat4 t;
        t[0] = texelFetch(transformPalette, ivec2(u, v), 0);
        t[1] = texelFetch(transformPalette, ivec2(u + 1, v), 0);
        t[2] = texelFetch(transformPalette, ivec2(u + 2, v), 0);
        t[3] = vec4(0.0, 0.0, 0.0, 1.0);

        model = matrix_model * transpose(t);
    }

    // handle transforms
    mat4 model_view = matrix_view * model;
    vec4 splat_cam = model_view * vec4(center, 1.0);

    // cull behind camera
    if (splat_cam.z > 0.0) {
        gl_Position = discardVec;
        return;
    }

    // get covariance
    vec3 covA, covB;
    getCovariance(covA, covB);

    vec4 v1v2 = calcV1V2(ortho ? vec3(0.0, 0.0, 1.0) : splat_cam.xyz, covA, covB, transpose(mat3(model_view)));

    // early out tiny splats
    if (dot(v1v2.xy, v1v2.xy) < 4.0 && dot(v1v2.zw, v1v2.zw) < 4.0) {
        gl_Position = discardVec;
        return;
    }

    vec4 splat_proj = matrix_projection * splat_cam;
    gl_Position = splat_proj + vec4((vertex_position.x * v1v2.xy + vertex_position.y * v1v2.zw) / viewport * splat_proj.w, 0, 0);

    // ensure splats aren't clipped by front and back clipping planes
    gl_Position.z = clamp(gl_Position.z, -abs(gl_Position.w), abs(gl_Position.w));

    // store texture coord and locked state
    texCoordIsLocked = vec3(vertex_position.xy * 0.5, (vertexState & 2u) != 0u ? 1.0 : 0.0);

    // handle splat color
    #ifdef FORWARD_PASS
        color = texelFetch(splatColor, splatUV, 0);

        #ifdef USE_SH1
            vec3 viewDir;
            if (ortho) {
                viewDir = normalize(-vec3(matrix_view[0].z, matrix_view[1].z, matrix_view[2].z) * mat3(model));
            } else {
                vec4 worldCenter = model * vec4(center, 1.0);
                viewDir = normalize((worldCenter.xyz / worldCenter.w - view_position) * mat3(model));
            }
            color.xyz = max(color.xyz + evalSH(viewDir), 0.0);
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

    #if UNDERLAY_PASS
        color = texelFetch(splatColor, splatUV, 0);
        color.xyz = mix(color.xyz, selectedClr.xyz * 0.2, selectedClr.a) * selectedClr.a;
    #endif

    #ifdef PICK_PASS
        color = texelFetch(splatColor, splatUV, 0);
        vertexId = splatId;
    #endif
}
`;

const fragmentShader = /*glsl*/`
varying mediump vec3 texCoordIsLocked;
varying mediump vec4 color;

#ifdef PICK_PASS
    flat varying highp uint vertexId;
#endif

uniform int mode;               // 0: centers, 1: rings
uniform float pickerAlpha;
uniform float ringSize;

void main(void)
{
    vec2 texCoord = texCoordIsLocked.xy;
    mediump float A = dot(texCoord, texCoord);

    #if OUTLINE_PASS
        float cutoff = (mode == 0) ? 0.02 : 1.0;
        if (A > cutoff) {
            discard;
        }
        gl_FragColor = vec4(1.0);
    #else
        if (A > 1.0) {
            discard;
        }

        mediump float B = exp(-A * 4.0) * color.a;

        #ifdef PICK_PASS
            if (B < pickerAlpha) {
                // locked
                discard;
            }

            gl_FragColor = vec4(
                float(vertexId & 255u),
                float((vertexId >> 8) & 255u),
                float((vertexId >> 16) & 255u),
                float((vertexId >> 24) & 255u)
            ) / 255.0;
        #else
            if (texCoordIsLocked.z == 0.0 && ringSize > 0.0) {
                // rings mode
                if (A < 1.0 - ringSize) {
                    B = max(0.05, B);
                } else {
                    B = 0.6;
                }
            }

            gl_FragColor = vec4(color.xyz, B);
        #endif
    #endif
}
`;

export { vertexShader, fragmentShader };
