const vertexShader = /* glsl */ `
    attribute vec3 vertex_position;

    uniform mat4 matrix_model;
    uniform mat4 matrix_viewProjection;

    void main() {
        gl_Position = matrix_viewProjection * matrix_model * vec4(vertex_position, 1.0);
    }
`;

const fragmentShader = /* glsl */ `
    // ray-box intersection in box space
    bool intersectBox(out float t0, out float t1, out int axis0, out int axis1, vec3 pos, vec3 dir, vec3 boxCen, vec3 boxLen)
    {
        bvec3 validDir = notEqual(dir, vec3(0.0));
        vec3 absDir = abs(dir);
        vec3 signDir = sign(dir);
        vec3 m = vec3(
            validDir.x ? 1.0 / absDir.x : 0.0,
            validDir.y ? 1.0 / absDir.y : 0.0,
            validDir.z ? 1.0 / absDir.z : 0.0
        ) * signDir;

        vec3 n = m * (pos - boxCen);
        vec3 k = abs(m) * boxLen;

        vec3 v0 = -n - k;
        vec3 v1 = -n + k;

        // replace invalid axes with -inf and +inf so the tests below ignore them
        v0 = mix(vec3(-1.0 / 0.0000001), v0, validDir);
        v1 = mix(vec3(1.0 / 0.0000001), v1, validDir);

        axis0 = (v0.x > v0.y) ? ((v0.x > v0.z) ? 0 : 2) : ((v0.y > v0.z) ? 1 : 2);
        axis1 = (v1.x < v1.y) ? ((v1.x < v1.z) ? 0 : 2) : ((v1.y < v1.z) ? 1 : 2);

        t0 = v0[axis0];
        t1 = v1[axis1];

        if (t0 > t1 || t1 < 0.0) {
            return false;
        }

        return true;
    }

    float calcDepth(in vec3 pos, in mat4 viewProjection) {
        vec4 v = viewProjection * vec4(pos, 1.0);
        return (v.z / v.w) * 0.5 + 0.5;
    }

    uniform sampler2D blueNoiseTex32;
    uniform mat4 matrix_viewProjection;
    uniform vec3 boxCen;
    uniform vec3 boxLen;

    uniform vec3 near_origin;
    uniform vec3 near_x;
    uniform vec3 near_y;

    uniform vec3 far_origin;
    uniform vec3 far_x;
    uniform vec3 far_y;

    uniform vec2 targetSize;

    bool writeDepth(float alpha) {
        ivec2 uv = ivec2(gl_FragCoord.xy);
        ivec2 size = textureSize(blueNoiseTex32, 0);
        return alpha > texelFetch(blueNoiseTex32, uv % size, 0).y;
    }

    bool strips(vec3 pos, int axis) {
        bvec3 b = lessThan(fract(pos * 2.0 + vec3(0.015)), vec3(0.03));
        b[axis] = false;
        return any(b);
    }

    void main() {
        vec2 clip = gl_FragCoord.xy / targetSize;
        vec3 worldNear = near_origin + near_x * clip.x + near_y * clip.y;
        vec3 worldFar = far_origin + far_x * clip.x + far_y * clip.y;
        vec3 rayDir = normalize(worldFar - worldNear);

        float t0, t1;
        int axis0, axis1;
        if (!intersectBox(t0, t1, axis0, axis1, worldNear, rayDir, boxCen, boxLen)) {
            gl_FragColor = vec4(1.0, 0.0, 0.0, 0.6);
            return;
        }

        vec3 frontPos = worldNear + rayDir * t0;
        bool front = t0 > 0.0 && strips(frontPos - boxCen, axis0);

        vec3 backPos = worldNear + rayDir * t1;
        bool back = strips(backPos - boxCen, axis1);

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
