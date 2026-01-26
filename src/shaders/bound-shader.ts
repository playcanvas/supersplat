const vertexShader = /* glsl */ `
    attribute vec2 vertex_position;
    void main(void) {
        gl_Position = vec4(vertex_position, 0.0, 1.0);
    }
`;

const fragmentShader = /* glsl */ `
    uniform highp usampler2D transformA;                // splat center x, y, z
    uniform highp usampler2D splatTransform;            // transform palette index
    uniform sampler2D transformPalette;                 // palette of transforms
    uniform sampler2D splatState;                       // per-splat state
    uniform highp ivec3 splat_params;                   // texture width, texture height, num splats

    // Custom infinity check that transpiles correctly to WGSL
    bvec3 isInf(vec3 v) {
        return greaterThan(abs(v), vec3(1e30));
    }

    // calculate min and max for a single column of splats
    // outputs both selected bounds and all visible bounds
    void main(void) {

        vec3 selectedMin = vec3(1e6);
        vec3 selectedMax = vec3(-1e6);
        vec3 visibleMin = vec3(1e6);
        vec3 visibleMax = vec3(-1e6);

        for (int id = 0; id < splat_params.y; id++) {
            // calculate splatUV
            ivec2 splatUV = ivec2(gl_FragCoord.x, id);

            // skip out-of-range splats
            if ((splatUV.x + splatUV.y * splat_params.x) >= splat_params.z) {
                continue;
            }

            // read splat state
            uint state = uint(texelFetch(splatState, splatUV, 0).r * 255.0);

            // skip deleted splats for both bounds
            if ((state & 4u) != 0u) {
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

            vec3 safeCenter = mix(center, vec3(1e6), isInf(center));

            // update visible bounds (all non-deleted splats)
            visibleMin = min(visibleMin, safeCenter);
            visibleMax = max(visibleMax, mix(center, visibleMax, isInf(center)));

            // update selected bounds (only exactly selected splats)
            if (state == 1u) {
                selectedMin = min(selectedMin, safeCenter);
                selectedMax = max(selectedMax, mix(center, selectedMax, isInf(center)));
            }
        }

        pcFragColor0 = vec4(selectedMin, 0.0);
        pcFragColor1 = vec4(selectedMax, 0.0);
        pcFragColor2 = vec4(visibleMin, 0.0);
        pcFragColor3 = vec4(visibleMax, 0.0);
    }
`;

export { vertexShader, fragmentShader };
