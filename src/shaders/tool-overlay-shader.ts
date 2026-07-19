// shaders for the shared in-scene tool overlay (dots, lines, fills).
// base passes render on the world layer so gaussians in front cover them;
// ghost passes re-render the geometry after the splat layer, dimmed and
// without depth testing, so occluded parts remain faintly visible.

const dotVertexShader = /* glsl */ `
    attribute vec3 vertex_position;
    attribute vec2 vertex_texCoord0;

    uniform mat4 matrix_model;
    uniform mat4 matrix_viewProjection;

    varying vec2 texCoord;

    void main() {
        texCoord = vertex_texCoord0;
        gl_Position = matrix_viewProjection * matrix_model * vec4(vertex_position, 1.0);
    }
`;

const dotFragmentShader = /* glsl */ `
    uniform sampler2D dotTexture;
    uniform float ghost;

    varying vec2 texCoord;

    void main() {
        vec4 tex = texture2D(dotTexture, texCoord);
        if (ghost == 0.0) {
            // opaque cutout so the base pass writes depth
            if (tex.a < 0.5) {
                discard;
            }
            gl_FragColor = vec4(tex.rgb, 1.0);
        } else {
            gl_FragColor = vec4(tex.rgb, tex.a * ghost);
        }
    }
`;

const lineVertexShader = /* glsl */ `
    attribute vec3 vertex_position;

    uniform mat4 matrix_model;
    uniform mat4 matrix_viewProjection;
    uniform float depthBias;

    void main() {
        gl_Position = matrix_viewProjection * matrix_model * vec4(vertex_position, 1.0);

        // depth stratum in ndc (see the strata table in tool-overlay.ts)
        gl_Position.z += depthBias * gl_Position.w;
    }
`;

const lineFragmentShader = /* glsl */ `
    uniform vec4 lineColor;

    void main() {
        gl_FragColor = lineColor;
    }
`;

const fillVertexShader = /* glsl */ `
    attribute vec3 vertex_position;

    uniform mat4 matrix_model;
    uniform mat4 matrix_viewProjection;

    varying vec4 clipPos;

    void main() {
        clipPos = matrix_viewProjection * matrix_model * vec4(vertex_position, 1.0);
        gl_Position = clipPos;
    }
`;

const fillFragmentShader = /* glsl */ `
    uniform sampler2D blueNoiseTex32;
    uniform vec4 fillColor;
    uniform float depthBias;

    varying vec4 clipPos;

    bool writeDepth(float alpha) {
        vec2 uv = fract(gl_FragCoord.xy / 32.0);
        float noise = texture2DLod(blueNoiseTex32, uv, 0.0).y;
        return alpha > noise;
    }

    void main() {
        gl_FragColor = fillColor;
        // depth stratum in window space (see the strata table in
        // tool-overlay.ts): the fill sits behind the coplanar dot/line strata
        // so its stochastic depth writes can't flicker the triangle edges
        gl_FragDepth = writeDepth(fillColor.a) ? (clipPos.z / clipPos.w) * 0.5 + 0.5 + depthBias : 1.0;
    }
`;

export {
    dotVertexShader,
    dotFragmentShader,
    lineVertexShader,
    lineFragmentShader,
    fillVertexShader,
    fillFragmentShader
};
