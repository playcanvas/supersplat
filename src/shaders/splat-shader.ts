
const vertexShader = /*glsl*/`
uniform vec3 view_position;

uniform sampler2D splatColor;
uniform sampler2D splatState;
uniform highp usampler2D splatTransform;        // per-splat index into transform palette
uniform sampler2D transformPalette;             // palette of transform matrices

varying mediump vec2 texCoord;
varying mediump vec4 color;
flat varying highp uint vertexState;

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
    vertexState = uint(texelFetch(splatState, splatUV, 0).r * 255.0);
    #ifdef OUTLINE_PASS
        if (vertexState != 1u) {
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

    vec4 v1v2 = calcV1V2(splat_cam.xyz, covA, covB, transpose(mat3(model_view)));

    // early out tiny splats
    if (dot(v1v2.xy, v1v2.xy) < 4.0 && dot(v1v2.zw, v1v2.zw) < 4.0) {
        gl_Position = discardVec;
        return;
    }

    vec4 splat_proj = matrix_projection * splat_cam;
    gl_Position = splat_proj + vec4((vertex_position.x * v1v2.xy + vertex_position.y * v1v2.zw) / viewport * splat_proj.w, 0, 0);

    // ensure splats aren't clipped by front and back clipping planes
    gl_Position.z = clamp(gl_Position.z, -abs(gl_Position.w), abs(gl_Position.w));

    texCoord = vertex_position.xy * 0.5;

    #ifdef FORWARD_PASS
        // get color
        color = texelFetch(splatColor, splatUV, 0);

        #ifdef USE_SH1
            vec4 worldCenter = model * vec4(center, 1.0);
            vec3 viewDir = normalize((worldCenter.xyz / worldCenter.w - view_position) * mat3(model));
            color.xyz = max(color.xyz + evalSH(viewDir), 0.0);
        #endif
    #endif

    #ifdef PICK_PASS
        color = texelFetch(splatColor, splatUV, 0);
        vertexId = splatId;
    #endif
}
`;

const fragmentShader = /*glsl*/`
varying mediump vec2 texCoord;
varying mediump vec4 color;

flat varying highp uint vertexState;

#ifdef PICK_PASS
    flat varying highp uint vertexId;
#endif

uniform int mode;               // 0: centers, 1: rings
uniform float pickerAlpha;
uniform float ringSize;
uniform float selectionAlpha;

void main(void)
{
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
            if (B < pickerAlpha || (vertexState & 2u) != 0u) {
                // hidden
                discard;
            }

            gl_FragColor = vec4(
                float(vertexId & 255u) / 255.0,
                float((vertexId >> 8) & 255u) / 255.0,
                float((vertexId >> 16) & 255u) / 255.0,
                float((vertexId >> 24) & 255u) / 255.0
            );
        #else
            vec3 c;
            float alpha;

            if ((vertexState & 2u) != 0u) {
                // frozen/hidden
                c = vec3(0.0, 0.0, 0.0);
                alpha = B * 0.05;
            } else {
                // get splat color
                if ((vertexState & 1u) != 0u) {
                    // selected
                    c = mix(color.xyz, vec3(1.0, 1.0, 0.0), selectionAlpha);
                } else {
                    // normal
                    c = color.xyz;
                }

                if (mode == 0 || ringSize == 0.0) {
                    // centers mode
                    alpha = B;
                }
                else {
                    // rings mode
                    if (A < 1.0 - ringSize) {
                        alpha = max(0.05, B);
                    } else {
                        alpha = 0.6;
                    }
                }
            }

            gl_FragColor = vec4(c, alpha);
        #endif
    #endif
}
`;

export { vertexShader, fragmentShader };
