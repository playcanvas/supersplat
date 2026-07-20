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

    void main() {
        gl_Position = matrix_viewProjection * matrix_model * vec4(vertex_position, 1.0);
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

    void main() {
        gl_Position = matrix_viewProjection * matrix_model * vec4(vertex_position, 1.0);
    }
`;

const fillFragmentShader = /* glsl */ `
    uniform sampler2D blueNoiseTex32;
    uniform vec4 fillColor;
    uniform vec2 depthBias;

    bool writeDepth(float alpha) {
        vec2 uv = fract(gl_FragCoord.xy / 32.0);
        float noise = texture2DLod(blueNoiseTex32, uv, 0.0).y;
        return alpha > noise;
    }

    void main() {
        gl_FragColor = fillColor;
        // depth stratum (see the strata table in tool-overlay.ts): a manual
        // polygon offset (slope-scaled term plus a constant a few depth
        // quanta wide) keeping the fill just behind the coplanar dot/line
        // strata at any camera distance. writing gl_FragDepth disables the
        // hardware polygon offset the line strata use, so it is applied here.
        gl_FragDepth = writeDepth(fillColor.a) ?
            gl_FragCoord.z + depthBias.x * fwidth(gl_FragCoord.z) + depthBias.y : 1.0;
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
