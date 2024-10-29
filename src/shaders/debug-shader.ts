const vertexShader = /* glsl */ `
    attribute vec3 vertex_position;
    attribute vec4 vertex_color;

    varying vec4 vColor;
    varying vec2 vZW;

    uniform mat4 matrix_model;
    uniform mat4 matrix_viewProjection;

    void main(void) {
        gl_Position = matrix_viewProjection * matrix_model * vec4(vertex_position, 1.0);

        // store z/w for later use in fragment shader
        vColor = vertex_color;
        vZW = gl_Position.zw;

        // disable depth clipping
        gl_Position.z = 0.0;
    }
`;

const fragmentShader = /* glsl */ `
    precision highp float;

    varying vec4 vColor;
    varying vec2 vZW;

    void main(void) {
        gl_FragColor = vColor;

        // clamp depth in Z to [0, 1] range
        gl_FragDepth = max(0.0, min(1.0, (vZW.x / vZW.y + 1.0) * 0.5));
    }
`;

export { vertexShader, fragmentShader };
