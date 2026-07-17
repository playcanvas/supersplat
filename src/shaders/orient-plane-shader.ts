const vertexShader = /* glsl */ `
    attribute vec3 vertex_position;

    uniform mat4 matrix_model;
    uniform mat4 matrix_viewProjection;

    varying vec4 clipPos;

    void main() {
        clipPos = matrix_viewProjection * matrix_model * vec4(vertex_position, 1.0);
        gl_Position = clipPos;
    }
`;

const fragmentShader = /* glsl */ `
    uniform sampler2D blueNoiseTex32;

    varying vec4 clipPos;

    bool writeDepth(float alpha) {
        vec2 uv = fract(gl_FragCoord.xy / 32.0);
        float noise = texture2DLod(blueNoiseTex32, uv, 0.0).y;
        return alpha > noise;
    }

    void main() {
        float alpha = 0.4;
        gl_FragColor = vec4(1.0, 0.4, 0.0, alpha);
        gl_FragDepth = writeDepth(alpha) ? (clipPos.z / clipPos.w) * 0.5 + 0.5 : 1.0;
    }
`;

export { vertexShader, fragmentShader };
