const vertexShader = /* glsl*/ `
    attribute vec2 vertex_position;
    void main(void) {
        gl_Position = vec4(vertex_position, 0.0, 1.0);
    }
`;

const fragmentShader = /* glsl*/ `
    uniform sampler2D srcTexture;
    void main(void) {
        ivec2 texel = ivec2(gl_FragCoord.xy);
        gl_FragColor = texelFetch(srcTexture, texel, 0);
    }
`;

export { vertexShader, fragmentShader };
