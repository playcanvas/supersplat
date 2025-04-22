const vertexShader = /* glsl */ `
    attribute vec2 vertex_position;
    void main(void) {
        gl_Position = vec4(vertex_position, 0.0, 1.0);
    }
`;

const fragmentShader = /* glsl */ `
    uniform highp usampler2D transformA;            // splat center x, y, z
    uniform highp usampler2D splatTransform;        // transform palette index
    uniform sampler2D transformPalette;             // palette of transforms
    uniform uvec2 splat_params;                     // splat texture width, num splats

    uniform mat4 matrix_model;
    uniform mat4 matrix_viewProjection;

    uniform uvec2 output_params;                    // output width, height

    // 0: mask, 1: rect, 2: sphere
    uniform int mode;

    // mask params
    uniform sampler2D mask;                         // mask in alpha channel
    uniform vec2 mask_params;                       // mask width, height

    // rect params
    uniform vec4 rect_params;                       // rect x, y, width, height

    // sphere params
    uniform vec4 sphere_params;                     // sphere x, y, z, radius

    // box params
    uniform vec4 box_params;                     // box x, y, z
    uniform vec4 aabb_params;                    // len x, y, z

    void main(void) {
        // calculate output id
        uvec2 outputUV = uvec2(gl_FragCoord);
        uint outputId = (outputUV.x + outputUV.y * output_params.x) * 4u;

        vec4 clr = vec4(0.0);

        for (uint i = 0u; i < 4u; i++) {
            uint id = outputId + i;

            if (id >= splat_params.y) {
                continue;
            }

            // calculate splatUV
            ivec2 splatUV = ivec2(
                int(id % splat_params.x),
                int(id / splat_params.x)
            );

            // read splat center
            vec3 center = uintBitsToFloat(texelFetch(transformA, splatUV, 0).xyz);

            // apply optional per-splat transform
            uint transformIndex = texelFetch(splatTransform, splatUV, 0).r;
            if (transformIndex > 0u) {
                // read transform matrix
                int u = int(transformIndex % 512u) * 3;
                int v = int(transformIndex / 512u);

                mat3x4 t;
                t[0] = texelFetch(transformPalette, ivec2(u, v), 0);
                t[1] = texelFetch(transformPalette, ivec2(u + 1, v), 0);
                t[2] = texelFetch(transformPalette, ivec2(u + 2, v), 0);

                center = vec4(center, 1.0) * t;
            }

            // transform to clip space and discard if outside
            vec3 world = (matrix_model * vec4(center, 1.0)).xyz;
            vec4 clip = matrix_viewProjection * vec4(world, 1.0);
            vec3 ndc = clip.xyz / clip.w;

            // skip offscreen fragments
            if (!any(greaterThan(abs(ndc), vec3(1.0)))) {
                if (mode == 0) {
                    // select by mask
                    ivec2 maskUV = ivec2((ndc.xy * vec2(0.5, -0.5) + 0.5) * mask_params);
                    clr[i] = texelFetch(mask, maskUV, 0).a < 1.0 ? 0.0 : 1.0;
                } else if (mode == 1) {
                    // select by rect
                    clr[i] = all(greaterThan(ndc.xy * vec2(1.0, -1.0), rect_params.xy)) && all(lessThan(ndc.xy * vec2(1.0, -1.0), rect_params.zw)) ? 1.0 : 0.0;
                } else if (mode == 2) {
                    // select by sphere
                    clr[i] = length(world - sphere_params.xyz) < sphere_params.w ? 1.0 : 0.0;
                } else if (mode == 3) {
                    // select by box
                    vec3 relativePosition = world - box_params.xyz;
                    bool isInsideCube = true;
                    if (relativePosition.x < -aabb_params.x || relativePosition.x > aabb_params.x) {
                        isInsideCube = false;
                    }
                    if (relativePosition.y < -aabb_params.y || relativePosition.y > aabb_params.y) {
                        isInsideCube = false;
                    }
                    if (relativePosition.z < -aabb_params.z || relativePosition.z > aabb_params.z) {
                        isInsideCube = false;
                    }
                    clr[i] = isInsideCube ? 1.0 : 0.0;
                }
            }
        }

        gl_FragColor = clr;
    }
`;

export { vertexShader, fragmentShader };
