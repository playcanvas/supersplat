const vertexShader = /* glsl */ `
    attribute vec3 vertex_position;

    uniform mat4 matrix_model;
    uniform mat4 matrix_viewProjection;

    void main() {
        gl_Position = matrix_viewProjection * matrix_model * vec4(vertex_position, 1.0);
    }
`;

const fragmentShader = /* glsl */ `
    bool intersectSphere(out float t0, out float t1, vec3 pos, vec3 dir, vec4 sphere) {
        vec3 L = sphere.xyz - pos;
        float tca = dot(L, dir);

        float d2 = sphere.w * sphere.w - (dot(L, L) - tca * tca);
        if (d2 <= 0.0) {
            return false;
        }

        float thc = sqrt(d2);
        t0 = tca - thc;
        t1 = tca + thc;
        if (t1 <= 0.0) {
            return false;
        }

        return true;
    }

    float calcDepth(in vec3 pos, in mat4 viewProjection) {
        vec4 v = viewProjection * vec4(pos, 1.0);
        return (v.z / v.w) * 0.5 + 0.5;
    }

    vec2 calcAzimuthElev(in vec3 dir) {
        float azimuth = atan(dir.z, dir.x);
        float elev = asin(dir.y);
        return vec2(azimuth, elev) * 180.0 / 3.14159;
    }

    uniform sampler2D blueNoiseTex32;
    uniform mat4 matrix_viewProjection;
    uniform vec4 sphere;

    uniform vec3 near_origin;
    uniform vec3 near_x;
    uniform vec3 near_y;

    uniform vec3 far_origin;
    uniform vec3 far_x;
    uniform vec3 far_y;

    uniform vec2 targetSize;

    bool writeDepth(float alpha) {
        vec2 uv = fract(gl_FragCoord.xy / 32.0);
        float noise = texture2DLodEXT(blueNoiseTex32, uv, 0.0).y;
        return alpha > noise;
    }

    bool strips(vec3 lp) {
        vec2 ae = calcAzimuthElev(normalize(lp));

        float spacing = 180.0 / (2.0 * 3.14159 * sphere.w);
        float size = 0.03;
        return fract(ae.x / spacing) < size ||
               fract(ae.y / spacing) < size;
    }

    void main() {
        vec2 clip = gl_FragCoord.xy / targetSize;
        vec3 worldNear = near_origin + near_x * clip.x + near_y * clip.y;
        vec3 worldFar = far_origin + far_x * clip.x + far_y * clip.y;

        vec3 rayDir = normalize(worldFar - worldNear);

        float t0, t1;
        if (!intersectSphere(t0, t1, worldNear, rayDir, sphere)) {
            discard;
        }

        vec3 frontPos = worldNear + rayDir * t0;
        bool front = t0 > 0.0 && strips(frontPos - sphere.xyz);

        vec3 backPos = worldNear + rayDir * t1;
        bool back = strips(backPos - sphere.xyz);

        if (front) {
            gl_FragColor = vec4(1.0, 1.0, 1.0, 0.6);
            gl_FragDepth = writeDepth(0.6) ? calcDepth(frontPos, matrix_viewProjection) : 1.0;
        } else if (back) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 0.6);
            gl_FragDepth = writeDepth(0.6) ? calcDepth(backPos, matrix_viewProjection) : 1.0;
        } else {
            discard;
        }
    }
`;

export { vertexShader, fragmentShader };
