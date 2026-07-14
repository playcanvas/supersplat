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

    // 0: mask, 1: rect, 2: sphere, 3: box
    uniform int mode;

    // mask params
    uniform sampler2D mask;                         // mask in alpha channel
    uniform vec2 mask_params;                       // mask width, height

    // rect params
    uniform vec4 rect_params;                       // rect x, y, width, height

    // sphere/box params: transforms world space into the shape's local space,
    // where the shape is the unit sphere (diameter 1) or unit cube (side 1)
    uniform mat4 shape_matrix_inv;

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

            // transform to world space (sphere/box modes test world-space containment)
            vec3 world = (matrix_model * vec4(center, 1.0)).xyz;

            if (mode == 0 || mode == 1) {
                // screen-space modes: project to clip space and skip offscreen fragments
                vec4 clip = matrix_viewProjection * vec4(world, 1.0);
                vec3 ndc = clip.xyz / clip.w;

                if (!any(greaterThan(abs(ndc), vec3(1.0)))) {
                    if (mode == 0) {
                        // select by mask
                        ivec2 maskUV = ivec2((ndc.xy * vec2(0.5, -0.5) + 0.5) * mask_params);
                        clr[i] = texelFetch(mask, maskUV, 0).a < 1.0 ? 0.0 : 1.0;
                    } else {
                        // select by rect
                        clr[i] = all(greaterThan(ndc.xy * vec2(1.0, -1.0), rect_params.xy)) && all(lessThan(ndc.xy * vec2(1.0, -1.0), rect_params.zw)) ? 1.0 : 0.0;
                    }
                }
            } else if (mode == 2) {
                // select by sphere (world-space, independent of camera frustum):
                // unit sphere test in shape-local space
                vec3 local = (shape_matrix_inv * vec4(world, 1.0)).xyz;
                clr[i] = length(local) < 0.5 ? 1.0 : 0.0;
            } else if (mode == 3) {
                // select by box (world-space, independent of camera frustum):
                // unit cube test in shape-local space
                vec3 local = (shape_matrix_inv * vec4(world, 1.0)).xyz;
                clr[i] = all(lessThanEqual(abs(local), vec3(0.5))) ? 1.0 : 0.0;
            }
        }

        gl_FragColor = clr;
    }
`;

export { vertexShader, fragmentShader };
