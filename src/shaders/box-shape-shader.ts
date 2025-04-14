const vertexShader = /* glsl */ `
    attribute vec3 vertex_position;

    uniform mat4 matrix_model;
    uniform mat4 matrix_viewProjection;

    void main() {
        gl_Position = matrix_viewProjection * matrix_model * vec4(vertex_position, 1.0);
    }
`;

const fragmentShader = /* glsl */ `
    bool rayAABBIntersect(vec3 origin, vec3 direction, vec3 aabbMin, vec3 aabbMax, out float tMin, out float tMax) {
        tMin = -1e30; 
        tMax = 1e30;  
    
        for (int i = 0; i < 3; i++) { 
            float dir = direction[i];
            if (abs(dir) < 1e-6) {
                if (origin[i] < aabbMin[i] || origin[i] > aabbMax[i]) { 
                    return false;
                }
            } else { 
                float invDir = 1.0 / dir; 
                float t1 = (aabbMin[i] - origin[i]) * invDir; 
                float t2 = (aabbMax[i] - origin[i]) * invDir;
            
                tMin = max(tMin, min(t1, t2)); 
                tMax = min(tMax, max(t1, t2));
            
                if (tMin > tMax) { 
                    return false;
                }
            }
        }
    
        return tMin >= 0.0;
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
    uniform vec4 box;
    uniform vec4 aabb;

    uniform vec3 near_origin;
    uniform vec3 near_x;
    uniform vec3 near_y;

    uniform vec3 far_origin;
    uniform vec3 far_x;
    uniform vec3 far_y;

    uniform vec2 targetSize;

    bool writeDepth(float alpha) {
        vec2 uv = fract(gl_FragCoord.xy / 32.0);
        float noise = texture2DLod(blueNoiseTex32, uv, 0.0).y;
        return alpha > noise;
    }

    bool strips(vec3 lp) {
        vec3 absLp = abs(lp);
        vec2 uv;
    
        if (absLp.x >= absLp.y && absLp.x >= absLp.z) {
            uv = vec2(lp.y, lp.z) / absLp.x;
        } else if (absLp.y >= absLp.x && absLp.y >= absLp.z) {
            uv = vec2(lp.x, lp.z) / absLp.y;
        } else {
            uv = vec2(lp.x, lp.y) / absLp.z;
        }
    
        float spacing = 0.5;
        float size = 0.03;  
    
        return fract(uv.x * spacing) <= size ||  fract(uv.y * spacing) <= size;
    }

    void main() {
        vec2 clip = gl_FragCoord.xy / targetSize;
        vec3 worldNear = near_origin + near_x * clip.x + near_y * clip.y;
        vec3 worldFar = far_origin + far_x * clip.x + far_y * clip.y;

        vec3 rayDir = normalize(worldFar - worldNear);

        float t0, t1;
        vec3 aabbMax = box.xyz + aabb.xyz;
        vec3 aabbMin = box.xyz - aabb.xyz;
        if (!rayAABBIntersect(worldNear, rayDir, aabbMin, aabbMax, t0, t1)) {
            discard;
        }

        vec3 frontPos = worldNear + rayDir * t0;
        bool front = t0 > 0.0 && strips(frontPos - box.xyz);

        vec3 backPos = worldNear + rayDir * t1;
        bool back = strips(backPos - box.xyz);

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
