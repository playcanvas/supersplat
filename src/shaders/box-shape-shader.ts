const vertexShader = /* wgsl */`
attribute vertex_position: vec3f;
uniform matrix_model: mat4x4f;
uniform matrix_viewProjection: mat4x4f;

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    output.position = uniform.matrix_viewProjection * uniform.matrix_model * vec4f(input.vertex_position, 1.0);
    return output;
}
`;

const fragmentShader = /* wgsl */`
uniform matrix_model: mat4x4f;
uniform matrix_viewProjection: mat4x4f;
uniform boxInvMat: mat4x4f;
uniform boxLen: vec3f;
uniform near_origin: vec3f;
uniform near_x: vec3f;
uniform near_y: vec3f;
uniform far_origin: vec3f;
uniform far_x: vec3f;
uniform far_y: vec3f;
uniform targetSize: vec2f;
var blueNoiseTex32: texture_2d<f32>;

struct BoxHit {
    hit: bool,
    nearDistance: f32,
    farDistance: f32,
    nearAxis: i32,
    farAxis: i32
}

fn intersectBox(position: vec3f, direction: vec3f, center: vec3f, halfExtents: vec3f) -> BoxHit {
    let validDirection = direction != vec3f(0.0);
    let reciprocal = select(vec3f(0.0), vec3f(1.0) / abs(direction), validDirection) * sign(direction);
    let n = reciprocal * (position - center);
    let k = abs(reciprocal) * halfExtents;
    var nearValues = -n - k;
    var farValues = -n + k;
    nearValues = select(vec3f(-1e7), nearValues, validDirection);
    farValues = select(vec3f(1e7), farValues, validDirection);

    let nearAxis = select(select(2, 1, nearValues.y > nearValues.z), select(2, 0, nearValues.x > nearValues.z), nearValues.x > nearValues.y);
    let farAxis = select(select(2, 1, farValues.y < farValues.z), select(2, 0, farValues.x < farValues.z), farValues.x < farValues.y);
    let nearDistance = nearValues[nearAxis];
    let farDistance = farValues[farAxis];
    return BoxHit(nearDistance <= farDistance && farDistance >= 0.0, nearDistance, farDistance, nearAxis, farAxis);
}

fn calcDepth(position: vec3f) -> f32 {
    let projected = uniform.matrix_viewProjection * vec4f(position, 1.0);
    return projected.z / projected.w;
}

fn writeDepth(alpha: f32) -> bool {
    let size = vec2i(textureDimensions(blueNoiseTex32, 0));
    return alpha > textureLoad(blueNoiseTex32, vec2i(pcPosition.xy) % size, 0).y;
}

fn strips(position: vec3f, axis: i32) -> bool {
    var stripe = fract(position * 2.0 + vec3f(0.015)) < vec3f(0.03);
    stripe[axis] = false;
    return any(stripe);
}

@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
    var output: FragmentOutput;
    let clip = vec2f(
        pcPosition.x / uniform.targetSize.x,
        1.0 - pcPosition.y / uniform.targetSize.y
    );
    let worldNear = uniform.near_origin + uniform.near_x * clip.x + uniform.near_y * clip.y;
    let worldFar = uniform.far_origin + uniform.far_x * clip.x + uniform.far_y * clip.y;
    let localNear = (uniform.boxInvMat * vec4f(worldNear, 1.0)).xyz;
    let localFar = (uniform.boxInvMat * vec4f(worldFar, 1.0)).xyz;
    let rayDirection = normalize(localFar - localNear);
    let hit = intersectBox(localNear, rayDirection, vec3f(0.0), vec3f(0.5));
    if (!hit.hit) {
        output.color = vec4f(1.0, 0.0, 0.0, 0.6);
        return output;
    }

    let frontLocal = localNear + rayDirection * hit.nearDistance;
    let front = hit.nearDistance > 0.0 && strips(frontLocal * uniform.boxLen * 2.0, hit.nearAxis);
    let backLocal = localNear + rayDirection * hit.farDistance;
    let back = strips(backLocal * uniform.boxLen * 2.0, hit.farAxis);

    if (front) {
        let frontPosition = (uniform.matrix_model * vec4f(frontLocal, 1.0)).xyz;
        output.color = vec4f(1.0, 1.0, 1.0, 0.6);
        output.fragDepth = select(1.0, calcDepth(frontPosition), writeDepth(0.6));
        return output;
    }
    if (back) {
        let backPosition = (uniform.matrix_model * vec4f(backLocal, 1.0)).xyz;
        output.color = vec4f(0.0, 0.0, 0.0, 0.6);
        output.fragDepth = select(1.0, calcDepth(backPosition), writeDepth(0.6));
        return output;
    }
    discard;
    return output;
}
`;

export { vertexShader, fragmentShader };
