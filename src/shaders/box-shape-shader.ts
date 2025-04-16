const vertexShader = /* glsl */ `
    attribute vec3 vertex_position;

    uniform mat4 matrix_model;
    uniform mat4 matrix_viewProjection;

    void main() {
        gl_Position = matrix_viewProjection * matrix_model * vec4(vertex_position, 1.0);
    }
`;

const fragmentShader = /* glsl */ `
    
    float calcDepth(in vec3 pos, in mat4 viewProjection) {
        vec4 v = viewProjection * vec4(pos, 1.0);
        return (v.z / v.w) * 0.5 + 0.5;
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

    vec2 iBox( in vec3 ro, in vec3 rd, in vec3 cen, in vec3 rad ) 
    {
        // ray-box intersection in box space
        vec3 m = 1.0/rd;
        vec3 n = m*(ro-cen);
        vec3 k = abs(m)*rad;
        
        vec3 t1 = -n - k;
        vec3 t2 = -n + k;

        float tN = max( max( t1.x, t1.y ), t1.z );
        float tF = min( min( t2.x, t2.y ), t2.z );
        
        if( tN > tF || tF < 0.0) return vec2(-1.0);

        return vec2( tN, tF );
    }

    void main() {
        vec2 clip = gl_FragCoord.xy / targetSize;
        vec3 worldNear = near_origin + near_x * clip.x + near_y * clip.y;
        vec3 worldFar = far_origin + far_x * clip.x + far_y * clip.y;

        vec3 rayDir = normalize(worldFar - worldNear);

        vec3 aabbMax = box.xyz + aabb.xyz;
        vec3 aabbMin = box.xyz - aabb.xyz;

        vec3 bcen = 0.5*(aabbMin+aabbMax);
        vec3 brad = 0.5*(aabbMax-aabbMin);
        vec2 tbox = iBox( worldNear, rayDir, bcen, brad );

        vec3 frontPos = worldNear + rayDir * tbox.x;
        vec3 backPos = worldNear + rayDir * tbox.y;

        if( tbox.x > 0.0 )
        {         
            vec3 pos = worldNear + rayDir*tbox.x;
            vec3 e = smoothstep( brad-0.03, brad-0.02, abs(pos-bcen) );
            float al = 1.0 - (1.0-e.x*e.y)*(1.0-e.y*e.z)*(1.0-e.z*e.x);
            // front face   
            if (al > 0.0)
            {
                gl_FragColor = vec4(1.0, 1.0, 1.0, 0.6);
                gl_FragDepth = writeDepth(0.6) ? calcDepth(frontPos, matrix_viewProjection) : 1.0;
            }
            else {
                pos = worldNear + rayDir*tbox.y;
                e = smoothstep( brad-0.03, brad-0.02, abs(pos-bcen) );
                al = 1.0 - (1.0-e.x*e.y)*(1.0-e.y*e.z)*(1.0-e.z*e.x);
                // back face
                if (al > 0.0)
                {
                    // col = mix( col, vec3(0.0), 0.25 + 0.75*al );
                    gl_FragColor = vec4(0, 0, 0, 0.6);
                    gl_FragDepth = writeDepth(0.6) ? calcDepth(backPos, matrix_viewProjection) : 1.0;
                }
            }
            
        } else {
            discard;
        }
    }
`;

export { vertexShader, fragmentShader };
