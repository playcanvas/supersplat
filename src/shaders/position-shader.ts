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
    uniform ivec2 splat_params;                     // splat texture width, num splats

    void main(void) {
        // calculate output id
        ivec2 splatUV = ivec2(gl_FragCoord);

        // skip if splat index is out of bounds
        if (splatUV.x + splatUV.y * splat_params.x >= splat_params.y) {
            discard;
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

        gl_FragColor = vec4(center, 0.0);
    }
`;

export { vertexShader, fragmentShader };
