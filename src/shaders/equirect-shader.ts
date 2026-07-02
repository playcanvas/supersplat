const vertexShader = /* glsl*/ `
    attribute vec2 vertex_position;
    void main(void) {
        gl_Position = vec4(vertex_position, 0.0, 1.0);
    }
`;

// project six 90° fov face renders to an equirectangular panorama. faces are
// captured in the (level or full) camera orientation frame, so the direction
// below is a capture-space direction: image center (lon 0, lat 0) is the
// capture forward (-Z), lon +PI/2 is capture right (+X), lat +PI/2 is up (+Y).
//
// face textures store camera renders bottom-row-first (flipY: false render
// targets), which matches gl_FragCoord's bottom-left origin, so t is
// up-positive and no flips are needed anywhere.
const fragmentShader = /* glsl*/ `
    uniform sampler2D uFace0;   // front -Z
    uniform sampler2D uFace1;   // right +X
    uniform sampler2D uFace2;   // back  +Z
    uniform sampler2D uFace3;   // left  -X
    uniform sampler2D uFace4;   // up    +Y
    uniform sampler2D uFace5;   // down  -Y
    uniform vec2 uTargetSize;

    #define PI 3.141592653589793

    void main(void) {
        vec2 uv = gl_FragCoord.xy / uTargetSize;
        float lon = (uv.x - 0.5) * 2.0 * PI;
        float lat = (uv.y - 0.5) * PI;

        vec3 d = vec3(sin(lon) * cos(lat), sin(lat), -cos(lon) * cos(lat));
        vec3 a = abs(d);

        // pick the face with the dominant axis, then map the direction to the
        // face's ndc: st = (dot(d, right), dot(d, up)) / dot(d, forward)
        vec2 st;
        vec4 c;
        if (a.x >= a.y && a.x >= a.z) {
            if (d.x > 0.0) {
                st = vec2(d.z, d.y) / a.x;
                c = texture2D(uFace1, st * 0.5 + 0.5);
            } else {
                st = vec2(-d.z, d.y) / a.x;
                c = texture2D(uFace3, st * 0.5 + 0.5);
            }
        } else if (a.y >= a.z) {
            if (d.y > 0.0) {
                st = vec2(d.x, d.z) / a.y;
                c = texture2D(uFace4, st * 0.5 + 0.5);
            } else {
                st = vec2(d.x, -d.z) / a.y;
                c = texture2D(uFace5, st * 0.5 + 0.5);
            }
        } else {
            if (d.z > 0.0) {
                st = vec2(-d.x, d.y) / a.z;
                c = texture2D(uFace2, st * 0.5 + 0.5);
            } else {
                st = vec2(d.x, d.y) / a.z;
                c = texture2D(uFace0, st * 0.5 + 0.5);
            }
        }

        gl_FragColor = c;
    }
`;

export { vertexShader, fragmentShader };
