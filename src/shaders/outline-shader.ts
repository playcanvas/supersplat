const vertexShader = /* glsl*/ `
    attribute vec2 vertex_position;
    void main(void) {
        gl_Position = vec4(vertex_position, 0.0, 1.0);
    }
`;

const fragmentShader = /* glsl*/ `
    uniform sampler2D outlineTexture;
    uniform vec4 clr;

    void main(void) {
        ivec2 texel = ivec2(gl_FragCoord.xy);

        // skip solid pixels
        if (texelFetch(outlineTexture, texel, 0).a != 0.0) {
            discard;
        }

        for (int x = -2; x <= 2; x++) {
            for (int y = -2; y <= 2; y++) {
                if ((x != 0) && (y != 0) && (texelFetch(outlineTexture, texel + ivec2(x, y), 0).a != 0.0)) {
                    gl_FragColor = clr;
                    return;
                }
            }
        }

        discard;
    }
`;

export { vertexShader, fragmentShader };
