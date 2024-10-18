const vertexShader = /*glsl*/ `
    attribute vec2 vertex_position;
    void main(void) {
        gl_Position = vec4(vertex_position, 0.0, 1.0);
    }
`;

const fragmentShader = /*glsl*/ `
    uniform sampler2D outlineTexture;

    void main(void) {
        if (texelFetch(outlineTexture, ivec2(gl_FragCoord.xy), 0).a != 0.0) {
            discard;
        }

        float sum = 0.0;
        for (float x = -3.0; x <= 3.0; x += 1.0) {
            for (float y = -3.0; y <= 3.0; y += 1.0) {
                sum += texelFetch(outlineTexture, ivec2(gl_FragCoord.xy + vec2(x, y)), 0).a;
            }
        }

        if (sum == 0.0) {
            discard;
        }

        gl_FragColor = vec4(1.0);
    }
`;

export { vertexShader, fragmentShader };