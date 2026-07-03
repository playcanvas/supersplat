const vertexShader = /* glsl */ `
    attribute vec3 vertex_position;

    uniform mat4 matrix_model;
    uniform mat4 matrix_viewProjection;

    varying vec3 vWorldPos;

    void main(void) {
        vec4 worldPos = matrix_model * vec4(vertex_position, 1.0);
        vWorldPos = worldPos.xyz;
        gl_Position = matrix_viewProjection * worldPos;
    }
`;

// depth-only prepass: lays down the nearest mesh surface so the blended solid
// shades a single layer and the wireframe can be depth-tested against it
const prepassFragmentShader = /* glsl */ `
    precision highp float;

    void main(void) {
        gl_FragColor = vec4(0.0);
    }
`;

// flat-shaded blue: the mesh has no normals, so derive the face normal from
// screen-space derivatives (always faces the viewer) and light it with a
// camera headlight plus a vertical hemisphere term
const solidFragmentShader = /* glsl */ `
    precision highp float;

    uniform vec3 view_position;
    uniform float uOpacity;

    varying vec3 vWorldPos;

    void main(void) {
        vec3 N = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
        vec3 V = normalize(view_position - vWorldPos);
        float hemi = N.y * 0.5 + 0.5;
        float headlight = max(dot(N, V), 0.0);
        vec3 color = vec3(0.25, 0.5, 0.9) * (0.25 + 0.35 * hemi + 0.55 * headlight);
        gl_FragColor = vec4(color, uOpacity);
    }
`;

const wireFragmentShader = /* glsl */ `
    precision highp float;

    varying vec3 vWorldPos;

    void main(void) {
        gl_FragColor = vec4(vec3(0.9), 1.0);
    }
`;

export { vertexShader, prepassFragmentShader, solidFragmentShader, wireFragmentShader };
