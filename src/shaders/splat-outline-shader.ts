
const vertexShader = /*glsl*/`
uniform vec3 view_position;

uniform sampler2D splatState;
uniform highp usampler2D splatTransform;        // per-splat index into transform palette
uniform sampler2D transformPalette;             // palette of transform matrices

varying mediump vec2 texCoord;

mediump vec4 discardVec = vec4(0.0, 0.0, 2.0, 1.0);

void main(void)
{
    // calculate splat uv
    if (!calcSplatUV()) {
        gl_Position = discardVec;
        return;
    }

    // get vertex state, discard if not selected
    uint vertexState = uint(texelFetch(splatState, splatUV, 0).r * 255.0);
    if (vertexState != 1u) {
        gl_Position = discardVec;
        return;
    }

    // get center
    vec3 center = getCenter();

    mat4 model = matrix_model;

    // handle per-splat transform
    uint transformIndex = texelFetch(splatTransform, splatUV, 0).r;
    if (transformIndex > 0u) {
        // read transform matrix
        int u = int(transformIndex % 512u) * 3;
        int v = int(transformIndex / 512u);

        mat4 t;
        t[0] = texelFetch(transformPalette, ivec2(u, v), 0);
        t[1] = texelFetch(transformPalette, ivec2(u + 1, v), 0);
        t[2] = texelFetch(transformPalette, ivec2(u + 2, v), 0);
        t[3] = vec4(0.0, 0.0, 0.0, 1.0);

        model = matrix_model * transpose(t);
    }

    // handle transforms
    mat4 model_view = matrix_view * model;
    vec4 splat_cam = model_view * vec4(center, 1.0);
    vec4 splat_proj = matrix_projection * splat_cam;

    // cull behind camera
    if (splat_proj.z < -splat_proj.w) {
        gl_Position = discardVec;
        return;
    }

    // get covariance
    vec3 covA, covB;
    getCovariance(covA, covB);

    vec4 v1v2 = calcV1V2(splat_cam.xyz, covA, covB, transpose(mat3(model_view)));

    // early out tiny splats
    if (dot(v1v2.xy, v1v2.xy) < 4.0 && dot(v1v2.zw, v1v2.zw) < 4.0) {
        gl_Position = discardVec;
        return;
    }

    gl_Position = splat_proj + vec4((vertex_position.x * v1v2.xy + vertex_position.y * v1v2.zw) / viewport * splat_proj.w, 0, 0);

    texCoord = vertex_position.xy * 0.5;
}
`;

const fragmentShader = /*glsl*/`
varying mediump vec2 texCoord;

void main(void)
{
    mediump float A = dot(texCoord, texCoord);
    if (A > 1.0) {
        discard;
    }

    gl_FragColor = vec4(1.0, 1.0, 0.0, 1.0);
}
`;

export { vertexShader, fragmentShader };
