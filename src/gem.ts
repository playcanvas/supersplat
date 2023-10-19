import {
    BLEND_PREMULTIPLIED,
    BUFFER_STATIC,
    INDEXFORMAT_UINT16,
    PRIMITIVE_TRIANGLES,
    SEMANTIC_NORMAL,
    SEMANTIC_POSITION,
    TYPE_FLOAT32,
    createShaderFromCode,
    BoundingBox,
    Entity,
    IndexBuffer,
    Material,
    Mesh,
    Shader,
    Vec3,
    GraphicsDevice,
    MeshInstance,
    VertexBuffer,
    VertexFormat
} from 'playcanvas';

const planeEpsilon = 1e-5;
const traceBounces = 3;

let gemId = 0;
let instanceId = 0;

const vshader = /* glsl */ `
attribute vec3 vertex_position;
attribute vec3 vertex_normal;

uniform mat4 matrix_viewProjection;
uniform mat4 matrix_model;
uniform mat4 matrix_model_inverse;

// world space
uniform vec3 view_position;

// model space
varying vec3 vertex_surface_pos;
varying vec3 vertex_surface_normal;
varying vec3 vertex_view_vec;

void main(void) {
    gl_Position = matrix_viewProjection * matrix_model * vec4(vertex_position, 1.0);

    vertex_surface_pos = vertex_position;
    vertex_surface_normal = vertex_normal;
    vertex_view_vec = vertex_position - (matrix_model_inverse * vec4(view_position, 1.0)).xyz;
}
`;

const fshader = (planeData: string, intersectFacesString: string) => {
    return /* glsl */ `
precision highp float;

${planeData}

uniform vec3 gem_absorption;

void intersectBackFace(inout float t, inout vec3 inormal, vec3 pos, vec3 dir, vec4 plane) {
    float d = dot(dir, plane.xyz);
    if (d > 0.0) {
        float n = -(dot(pos, plane.xyz) + plane.w) / d;
        if (n < t) {
            t = n;
            inormal = -plane.xyz;
        }
    }
}

float intersectBackFaces(inout vec3 inormal, vec3 pos, vec3 dir) {
    float t = 1000.0;
    ${intersectFacesString}
    return t;
}

vec3 decodeRGBM(vec4 raw) {
    vec3 color = (8.0 * raw.a) * raw.rgb;
    return color * color;
}

vec3 decodeRGBP(vec4 raw) {
    vec3 color = raw.rgb * (-raw.a * 7.0 + 8.0);
    return color * color;
}

vec3 gammaCorrectOutput(vec3 color) {
    return pow(color + 0.0000001, vec3(1.0 / 2.2));
}

float calcFresnel(vec3 i, vec3 n) {
    return pow(1.0 - clamp(dot(n, i), 0.0, 1.0), 4.0);
}

// the envAtlas is fixed at 512 pixels. every equirect is generated with 1 pixel boundary.
const float atlasSize = 512.0;
const float seamSize = 1.0 / atlasSize;

// map a normalized equirect UV to the given rectangle (taking 1 pixel seam into account).
vec2 mapUv(vec2 uv, vec4 rect) {
    return vec2(mix(rect.x + seamSize, rect.x + rect.z - seamSize, uv.x),
                mix(rect.y + seamSize, rect.y + rect.w - seamSize, uv.y));
}

// map shiny level UV
vec2 mapShinyUv(vec2 uv, float level) {
    float t = 1.0 / exp2(level);
    return mapUv(uv, vec4(1.0 - t, 1.0 - t, t, t * 0.5));
}

const float PI = 3.141592653589793;

vec2 toSpherical(vec3 dir) {
    return vec2(dir.xz == vec2(0.0) ? 0.0 : atan(dir.x, dir.z), asin(dir.y));
}

vec2 toSphericalUv(vec3 dir) {
    vec2 uv = toSpherical(dir) / vec2(PI * 2.0, PI) + 0.5;
    return vec2(uv.x, 1.0 - uv.y);
}

uniform sampler2D texture_envAtlas;
vec3 sampleEnvAtlas(vec3 dir) {
    vec2 uv = toSphericalUv(dir * vec3(-1.0, 1.0, 1.0));
    vec2 uv0 = mapShinyUv(uv, 0.0);
    vec4 raw = texture2D(texture_envAtlas, uv0);
    return decodeRGBP(raw);
}

vec3 sampleEnvAset(vec3 dir) {
    return vec3(
        step(0.70, dir.y) * step(dir.y, 0.98),
        step(0.0, dir.y) * step(dir.y, 0.70),
        step(0.98, dir.y)
    );
}

// uniform samplerCube texture_cubeMap;
vec3 sampleEnv(vec3 dir) {
    // vec4 raw = texture(texture_cubeMap, dir * vec3(-1.0, 1.0, 1.0));
    // return decodeRGBM(raw);

    return sampleEnvAtlas(dir);
    // return sampleEnvAset(dir);
}

vec3 traceInternal(vec3 pos, vec3 dir, float ri) {
    vec3 result = vec3(0.0);
    float t = 1.0, totalDist = 0.0;
    vec3 p, n;
    for (int i = 0; i < ${traceBounces}; ++i) {
        float dist = intersectBackFaces(n, pos, dir);
        totalDist += dist;
        p = pos + dir * dist;

        // external refraction
        vec3 f = refract(dir, n, ri);

        if (f != vec3(0.0)) {
            float fresnel = calcFresnel(-dir, n);
            result += sampleEnv(f) * (1.0 - fresnel) * t;
            t *= fresnel;
        }

        pos = p;
        dir = reflect(dir, n);
    }

    result += sampleEnv(dir) * t;

    // apply beer absorption
    result *= exp(-gem_absorption * totalDist);

    return result;
}

void writeFinalOutput(vec3 color) {
    gl_FragColor = vec4(gammaCorrectOutput(color), 1.0);
}

const float airRI = 1.0;
const vec3 diamondEta = vec3(2.410, 2.420, 2.435);
const vec3 invDiamondEta = vec3(1.0 / diamondEta.x, 1.0 / diamondEta.y, 1.0 / diamondEta.z);

varying vec3 vertex_surface_pos;
varying vec3 vertex_surface_normal;
varying vec3 vertex_view_vec;

void main(void) {
    vec3 surface_normal = normalize(vertex_surface_normal);
    vec3 view_vec = normalize(vertex_view_vec);

    // trace a single internal ray
    vec3 internal =
        traceInternal(vertex_surface_pos, refract(view_vec, surface_normal, invDiamondEta.x), diamondEta.x);

    // trace an internal ray for r, g, b separately
    // vec3 internal = vec3(
    //     traceInternal(vertex_surface_pos, refract(view_vec, surface_normal, invDiamondEta.x), diamondEta.x).x,
    //     traceInternal(vertex_surface_pos, refract(view_vec, surface_normal, invDiamondEta.y), diamondEta.y).y,
    //     traceInternal(vertex_surface_pos, refract(view_vec, surface_normal, invDiamondEta.z), diamondEta.z).z
    // );

    // external reflection
    vec3 env = sampleEnv(normalize(reflect(view_vec, surface_normal)));

    vec3 finalColor = mix(internal, env, calcFresnel(-view_vec, surface_normal));

    writeFinalOutput(finalColor);
}
`;
};

const normal = new Vec3();
const pa = new Vec3();
const pb = new Vec3();
const pc = new Vec3();
const na = new Vec3();
const nb = new Vec3();

class MeshBuilder {
    data: Float32Array;
    current = 0;

    constructor(numVertices: number) {
        this.data = new Float32Array(numVertices * 6);
    }

    add(position: Vec3, normal: Vec3) {
        const i = this.current++;
        this.data[i * 6 + 0] = position.x;
        this.data[i * 6 + 1] = position.y;
        this.data[i * 6 + 2] = position.z;
        this.data[i * 6 + 3] = normal.x;
        this.data[i * 6 + 4] = normal.y;
        this.data[i * 6 + 5] = normal.z;
    }
}

class Gem {
    planes: number[];
    mesh: Mesh;
    shader: Shader;
    material: Material;

    constructor(graphicsDevice: GraphicsDevice, vertexData: Float32Array, aabb: BoundingBox, planes: number[]) {
        this.planes = planes;

        const p = this.planes;
        const numPlanes = p.length / 4;

        let planeDataString = '';
        let intersectBackFaces = '';
        for (let i = 0; i < numPlanes; ++i) {
            planeDataString += `const vec4 plane_${i} = vec4(${p[i * 4].toFixed(6)},${p[i * 4 + 1].toFixed(6)},${p[
                i * 4 + 2
            ].toFixed(6)},${p[i * 4 + 3].toFixed(6)});\n`;
            intersectBackFaces += `intersectBackFace(t, inormal, pos, dir, plane_${i});\n`;
        }

        const processedShader = fshader(planeDataString, intersectBackFaces);

        this.shader = createShaderFromCode(graphicsDevice, vshader, processedShader, `gem-${gemId++}`, {
            vertex_position: SEMANTIC_POSITION,
            vertex_normal: SEMANTIC_NORMAL
        });

        this.material = new Material();
        this.material.blendType = BLEND_PREMULTIPLIED;
        this.material.shader = this.shader;

        // construct the mesh
        const vertexFormat = new VertexFormat(graphicsDevice, [
            {
                semantic: SEMANTIC_POSITION,
                type: TYPE_FLOAT32,
                components: 3
            },
            {
                semantic: SEMANTIC_NORMAL,
                type: TYPE_FLOAT32,
                components: 3
            }
        ]);

        const vertexBuffer = new VertexBuffer(
            graphicsDevice,
            vertexFormat,
            vertexData.length / 6,
            BUFFER_STATIC,
            vertexData.buffer
        );

        this.mesh = new Mesh(graphicsDevice);
        this.mesh.vertexBuffer = vertexBuffer;
        this.mesh.primitive[0].type = PRIMITIVE_TRIANGLES;
        this.mesh.primitive[0].base = 0;
        this.mesh.primitive[0].count = vertexData.length / 6;
        this.mesh.primitive[0].indexed = false;
        this.mesh.aabb.copy(aabb);
    }

    static createFromMesh(mesh: Mesh, graphicsDevice: GraphicsDevice) {
        const positions = new Float32Array(mesh.vertexBuffer.numVertices * 3);
        mesh.getPositions(positions);

        const indices = new Uint16Array(mesh.indexBuffer[0].lock());

        const planes: number[] = [];

        const meshBuilder = new MeshBuilder(indices.length);

        for (let i = 0; i < indices.length / 3; ++i) {
            const a = indices[i * 3 + 0];
            const b = indices[i * 3 + 1];
            const c = indices[i * 3 + 2];

            pa.set(positions[a * 3 + 0], positions[a * 3 + 1], positions[a * 3 + 2]);
            pb.set(positions[b * 3 + 0], positions[b * 3 + 1], positions[b * 3 + 2]);
            pc.set(positions[c * 3 + 0], positions[c * 3 + 1], positions[c * 3 + 2]);

            // calculate plane
            na.sub2(pb, pa);
            nb.sub2(pc, pa);
            normal.cross(na, nb).normalize();

            meshBuilder.add(pa, normal);
            meshBuilder.add(pb, normal);
            meshBuilder.add(pc, normal);

            const d = -normal.dot(pa);

            // check the plane doesn't already exist
            let j;
            for (j = 0; j < planes.length / 4; ++j) {
                if (
                    Math.abs(normal.x - planes[j * 4 + 0]) < planeEpsilon &&
                    Math.abs(normal.y - planes[j * 4 + 1]) < planeEpsilon &&
                    Math.abs(normal.z - planes[j * 4 + 2]) < planeEpsilon &&
                    Math.abs(d - planes[j * 4 + 3]) < planeEpsilon
                ) {
                    break;
                }
            }

            if (j === planes.length / 4) {
                planes.push(normal.x, normal.y, normal.z, d);
            }
        }

        return new Gem(graphicsDevice, meshBuilder.data, mesh.aabb, planes);
    }
}

export {Gem};
