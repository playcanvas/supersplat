const faceFov = 100;
const blendStart = 40;

const outerTan = Math.tan((faceFov / 2) * (Math.PI / 180));
const innerTan = Math.tan(blendStart * (Math.PI / 180));
const uvScale = 0.5 / outerTan;

const vertexShader = /* wgsl */`
attribute vertex_position: vec2f;

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    output.position = vec4f(input.vertex_position, 0.0, 1.0);
    return output;
}
`;

const fragmentShader = /* wgsl */`
var uFace0: texture_2d<f32>;
var uFace0_sampler: sampler;
var uFace1: texture_2d<f32>;
var uFace1_sampler: sampler;
var uFace2: texture_2d<f32>;
var uFace2_sampler: sampler;
var uFace3: texture_2d<f32>;
var uFace3_sampler: sampler;
var uFace4: texture_2d<f32>;
var uFace4_sampler: sampler;
var uFace5: texture_2d<f32>;
var uFace5_sampler: sampler;
uniform uTargetSize: vec2f;

const PI = 3.141592653589793;

struct FaceSample {
    weight: f32,
    uv: vec2f
}

fn faceSample(d: vec3f, r: vec3f, u: vec3f, f: vec3f) -> FaceSample {
    let dn = dot(d, f);
    if (dn <= 0.0) {
        return FaceSample(0.0, vec2f(0.0));
    }
    let p = vec2f(dot(d, r), dot(d, u)) / dn;
    let uv = vec2f(p.x, -p.y) * ${uvScale.toFixed(8)} + vec2f(0.5);
    let weight = 1.0 - smoothstep(${innerTan.toFixed(8)}, ${outerTan.toFixed(8)}, max(abs(p.x), abs(p.y)));
    return FaceSample(weight, uv);
}

@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
    var output: FragmentOutput;
    let uv = pcPosition.xy / uniform.uTargetSize;
    let lon = (uv.x - 0.5) * 2.0 * PI;
    let lat = (0.5 - uv.y) * PI;
    let d = vec3f(sin(lon) * cos(lat), sin(lat), -cos(lon) * cos(lat));

    var acc = vec4f(0.0);
    var weightSum = 0.0;

    var face = faceSample(d, vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), vec3f(0.0, 0.0, -1.0));
    if (face.weight > 0.0) { acc += face.weight * textureSampleLevel(uFace0, uFace0_sampler, face.uv, 0.0); weightSum += face.weight; }
    face = faceSample(d, vec3f(0.0, 0.0, 1.0), vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0));
    if (face.weight > 0.0) { acc += face.weight * textureSampleLevel(uFace1, uFace1_sampler, face.uv, 0.0); weightSum += face.weight; }
    face = faceSample(d, vec3f(-1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), vec3f(0.0, 0.0, 1.0));
    if (face.weight > 0.0) { acc += face.weight * textureSampleLevel(uFace2, uFace2_sampler, face.uv, 0.0); weightSum += face.weight; }
    face = faceSample(d, vec3f(0.0, 0.0, -1.0), vec3f(0.0, 1.0, 0.0), vec3f(-1.0, 0.0, 0.0));
    if (face.weight > 0.0) { acc += face.weight * textureSampleLevel(uFace3, uFace3_sampler, face.uv, 0.0); weightSum += face.weight; }
    face = faceSample(d, vec3f(1.0, 0.0, 0.0), vec3f(0.0, 0.0, 1.0), vec3f(0.0, 1.0, 0.0));
    if (face.weight > 0.0) { acc += face.weight * textureSampleLevel(uFace4, uFace4_sampler, face.uv, 0.0); weightSum += face.weight; }
    face = faceSample(d, vec3f(1.0, 0.0, 0.0), vec3f(0.0, 0.0, -1.0), vec3f(0.0, -1.0, 0.0));
    if (face.weight > 0.0) { acc += face.weight * textureSampleLevel(uFace5, uFace5_sampler, face.uv, 0.0); weightSum += face.weight; }

    output.color = acc / max(weightSum, 1e-5);
    return output;
}
`;

export { faceFov, vertexShader, fragmentShader };
