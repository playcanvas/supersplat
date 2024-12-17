const vertexShader = /* glsl*/ `
    attribute vec2 vertex_position;
    void main(void) {
        gl_Position = vec4(vertex_position, 0.0, 1.0);
    }
`;

const fragmentShader = /* glsl*/ `
    uniform sampler2D outlineTexture;
    uniform float alphaCutoff;
    uniform vec4 clr;

    void main(void) {
        ivec2 texel = ivec2(gl_FragCoord.xy);

        // skip solid pixels
        if (texelFetch(outlineTexture, texel, 0).a > alphaCutoff) {
            discard;
        }

        for (int x = -3; x <= 3; x++) {
            for (int y = -3; y <= 3; y++) {
                if ((x != 0) && (y != 0) && (texelFetch(outlineTexture, texel + ivec2(x, y), 0).a > alphaCutoff)) {
                    gl_FragColor = clr;
                    return;
                }
            }
        }

        discard;
    }
`;

export { vertexShader, fragmentShader };
