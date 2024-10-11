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

    uniform vec3 tex_params;                        // texture width, texture height, num splats
    uniform mat4 matrix_model;
    uniform mat4 matrix_viewProjection;

    // mode selector: 0: mask, 1: rect, 2: sphere
    uniform int mode;

    // mask params
    uniform sampler2D mask;                         // mask in alpha channel
    uniform vec2 mask_params;                       // mask width, height

    // rect params
    uniform vec4 rect_params;                       // rect x, y, width, height

    // sphere params
    uniform vec4 sphere_params;                     // sphere x, y, z, radius

    void main(void) {
        // calculate splat UV and index
        ivec2 splatUV = ivec2(gl_FragCoord);
        uint splatId = uint(splatUV.x + splatUV.y * int(tex_params.x));
        if (splatId >= uint(tex_params.z)) {
            gl_FragColor = vec4(0.25);
            return;
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

        // transform to clip space and discard if outside
        vec3 world = (matrix_model * vec4(center, 1.0)).xyz;
        vec4 clip = matrix_viewProjection * vec4(world, 1.0);
        vec3 ndc = clip.xyz / clip.w;

        // discard offscreen fragments
        if (any(greaterThan(abs(ndc), vec3(1.0)))) {
            gl_FragColor = vec4(0.75);
            return;
        }

        float result;

        if (mode == 0) {
            // select by mask
            ivec2 maskUV = ivec2((ndc.xy * vec2(0.5, -0.5) + 0.5) * mask_params);
            result = texelFetch(mask, maskUV, 0).a < 1.0 ? 0.0 : 1.0;
        } else if (mode == 1) {
            // select by rect
            result = all(greaterThan(ndc.xy * vec2(1.0, -1.0), rect_params.xy)) && all(lessThan(ndc.xy * vec2(1.0, -1.0), rect_params.zw)) ? 1.0 : 0.0;
        } else if (mode == 2) {
            // select by sphere
            result = length(world - sphere_params.xyz) < sphere_params.w ? 1.0 : 0.0;
        }

        gl_FragColor = vec4(result);
    }
`;

export { vertexShader, fragmentShader };
