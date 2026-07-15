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
uniform matrix_viewProjection: mat4x4f;
uniform sphere: vec4f;
uniform near_origin: vec3f;
uniform near_x: vec3f;
uniform near_y: vec3f;
uniform far_origin: vec3f;
uniform far_x: vec3f;
uniform far_y: vec3f;
uniform targetSize: vec2f;
var blueNoiseTex32: texture_2d<f32>;

struct SphereHit {
    hit: bool,
    nearDistance: f32,
    farDistance: f32
}

fn intersectSphere(position: vec3f, direction: vec3f, sphereValue: vec4f) -> SphereHit {
    let toCenter = sphereValue.xyz - position;
    let centerDistance = dot(toCenter, direction);
    let radiusSquared = sphereValue.w * sphereValue.w - (dot(toCenter, toCenter) - centerDistance * centerDistance);
    if (radiusSquared <= 0.0) {
        return SphereHit(false, 0.0, 0.0);
    }
    let halfChord = sqrt(radiusSquared);
    let nearDistance = centerDistance - halfChord;
    let farDistance = centerDistance + halfChord;
    return SphereHit(farDistance > 0.0, nearDistance, farDistance);
}

fn calcDepth(position: vec3f) -> f32 {
    let projected = uniform.matrix_viewProjection * vec4f(position, 1.0);
    return projected.z / projected.w;
}

fn writeDepth(alpha: f32) -> bool {
    let size = vec2i(textureDimensions(blueNoiseTex32, 0));
    return alpha > textureLoad(blueNoiseTex32, vec2i(pcPosition.xy) % size, 0).y;
}

fn strips(localPosition: vec3f) -> bool {
    let direction = normalize(localPosition);
    let azimuthElevation = vec2f(atan2(direction.z, direction.x), asin(direction.y)) * 180.0 / 3.14159;
    let spacing = 180.0 / (2.0 * 3.14159 * uniform.sphere.w);
    return fract(azimuthElevation.x / spacing) < 0.03 || fract(azimuthElevation.y / spacing) < 0.03;
}

@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
    var output: FragmentOutput;
    let clip = pcPosition.xy / uniform.targetSize;
    let worldNear = uniform.near_origin + uniform.near_x * clip.x + uniform.near_y * clip.y;
    let worldFar = uniform.far_origin + uniform.far_x * clip.x + uniform.far_y * clip.y;
    let rayDirection = normalize(worldFar - worldNear);
    let hit = intersectSphere(worldNear, rayDirection, uniform.sphere);
    if (!hit.hit) {
        discard;
    }

    let frontPosition = worldNear + rayDirection * hit.nearDistance;
    let front = hit.nearDistance > 0.0 && strips(frontPosition - uniform.sphere.xyz);
    let backPosition = worldNear + rayDirection * hit.farDistance;
    let back = strips(backPosition - uniform.sphere.xyz);

    if (front) {
        output.color = vec4f(1.0, 1.0, 1.0, 0.6);
        output.fragDepth = select(1.0, calcDepth(frontPosition), writeDepth(0.6));
        return output;
    }
    if (back) {
        output.color = vec4f(0.0, 0.0, 0.0, 0.6);
        output.fragDepth = select(1.0, calcDepth(backPosition), writeDepth(0.6));
        return output;
    }
    discard;
    return output;
}
`;

export { vertexShader, fragmentShader };
