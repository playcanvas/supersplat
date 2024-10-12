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
    uniform sampler2D splatState;                   // per-splat state
    uniform uvec2 splat_params;                     // texture width, num splats

    // 0: selected, 1: visible
    uniform int mode;

    void main(void) {

        vec3 boundMin = vec3(100000);
        vec3 boundMax = vec3(-100000);

        for (uint id = 0u; id < splat_params.y; id++) {
            // calculate splatUV
            ivec2 splatUV = ivec2(
                int(id % splat_params.x),
                int(id / splat_params.x)
            );

            // read splat state
            uint state = uint(texelFetch(splatState, splatUV, 0).r * 255.0);

            // skip deleted or hidden splats
            if (((mode == 0) && (state != 1u)) || ((mode == 1) && ((state & 4u) != 0u))) {
                continue;
            }

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

            boundMin = min(boundMin, center);
            boundMax = max(boundMax, center);
        }

        pcFragColor0 = vec4(boundMin, 0.0);
        pcFragColor1 = vec4(boundMax, 0.0);
    }
`;

export { vertexShader, fragmentShader };
