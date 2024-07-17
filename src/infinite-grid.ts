import {
    CULLFACE_NONE,
    FUNC_ALWAYS,
    SEMANTIC_POSITION,
    BlendState,
    DepthState,
    Mat4,
    QuadRender,
    Shader,
    Vec3,
    createShaderFromCode
} from 'playcanvas';
import { Element, ElementType } from './element';
import { Serializer } from './serializer';

const vsCode = /*glsl*/ `
    uniform mat4 matrix_viewProjectionInverse;

    attribute vec2 vertex_position;

    varying vec3 worldFar;

    void main(void) {
        gl_Position = vec4(vertex_position, 0.0, 1.0);

        vec4 v = matrix_viewProjectionInverse * vec4(vertex_position, 1.0, 1.0);

        worldFar = v.xyz / v.w;
    }
`;

const fsCode = /*glsl*/ `
    uniform mat4 matrix_viewProjection;
    uniform vec3 view_position;
    uniform sampler2D blueNoiseTex32;

    varying vec3 worldFar;

    bool intersectPlane(inout float t, vec3 pos, vec3 dir, vec4 plane) {
        float d = dot(dir, plane.xyz);
        if (abs(d) < 1e-06) {
            return false;
        }

        float n = -(dot(pos, plane.xyz) + plane.w) / d;
        if (n < 0.0) {
            return false;
        }

        t = n;

        return true;
    }

    // https://bgolus.medium.com/the-best-darn-grid-shader-yet-727f9278b9d8#1e7c
    float pristineGrid( in vec2 uv, in vec2 ddx, in vec2 ddy, vec2 lineWidth)
    {
        vec2 uvDeriv = vec2(length(vec2(ddx.x, ddy.x)), length(vec2(ddx.y, ddy.y)));
        bvec2 invertLine = bvec2(lineWidth.x > 0.5, lineWidth.y > 0.5);
        vec2 targetWidth = vec2(
            invertLine.x ? 1.0 - lineWidth.x : lineWidth.x,
            invertLine.y ? 1.0 - lineWidth.y : lineWidth.y
        );
        vec2 drawWidth = clamp(targetWidth, uvDeriv, vec2(0.5));
        vec2 lineAA = uvDeriv * 1.5;
        vec2 gridUV = abs(fract(uv) * 2.0 - 1.0);
        gridUV.x = invertLine.x ? gridUV.x : 1.0 - gridUV.x;
        gridUV.y = invertLine.y ? gridUV.y : 1.0 - gridUV.y;
        vec2 grid2 = smoothstep(drawWidth + lineAA, drawWidth - lineAA, gridUV);

        grid2 *= clamp(targetWidth / drawWidth, 0.0, 1.0);
        grid2 = mix(grid2, targetWidth, clamp(uvDeriv * 2.0 - 1.0, 0.0, 1.0));
        grid2.x = invertLine.x ? 1.0 - grid2.x : grid2.x;
        grid2.y = invertLine.y ? 1.0 - grid2.y : grid2.y;

        return mix(grid2.x, 1.0, grid2.y);
    }

    float calcDepth(vec3 p) {
        vec4 v = matrix_viewProjection * vec4(p, 1.0);
        return (v.z / v.w) * 0.5 + 0.5;
    }

    void main(void) {
        vec3 p = view_position;
        vec3 v = normalize(worldFar - view_position);

        // intersect ray with the world xz plane
        float t;
        if (!intersectPlane(t, p, v, vec4(0, 1, 0, 0))) {
            discard;
        }

        // calculate grid intersection
        vec3 pos = p + v * t;

        // discard distant pixels
        float dist = length(pos.xz - view_position.xz);
        if (dist > 200.0) {
            discard;
        }

        // evaluate the grid function
        float grid = pristineGrid(pos.xz, dFdx(pos.xz), dFdy(pos.xz), vec2(1.0 / 50.0));

        // smooth fade into distance
        float a = grid * (1.0 - sin(dist / 200.0 * 3.14159 * 0.5));

        // early discard semitrans pixels
        if (a < 0.1) {
            discard;
        }

        if (a < 0.9) {
            // apply dithered discard for semitrans pixels
            vec2 uv = fract(gl_FragCoord.xy / 32.0);
            float noise = texture2DLodEXT(blueNoiseTex32, uv, 0.0).y;
            if (a < noise) {
                discard;
            }
        }

        // calculate color
        vec3 color;

        vec3 apos = abs(pos);
        if (apos.x < 0.05) {
            if (apos.z < 0.05) {
                color = vec3(1.0);
            } else {
                color = vec3(0.2, 0.2, 1.0);
            }
        } else if (apos.z < 0.05) {
            color = vec3(1.0, 0.2, 0.2);
        } else {
            color = vec3(0.6);
        }

        gl_FragColor = vec4(color, 1.0);
        gl_FragDepth = calcDepth(pos);
    }
`;

const attributes = {
    vertex_position: SEMANTIC_POSITION
};

class InfiniteGrid extends Element {
    shader: Shader;
    quadRender: QuadRender;
    blendState = new BlendState(false);
    depthState = new DepthState(FUNC_ALWAYS, true);

    visible = true;

    constructor() {
        super(ElementType.debug);
    }

    add() {
        const device = this.scene.app.graphicsDevice;

        this.shader = createShaderFromCode(device, vsCode, fsCode, 'infinite-grid', attributes);
        this.quadRender = new QuadRender(this.shader);

        const viewPosition = device.scope.resolve('view_position');
        const viewProjection = device.scope.resolve('matrix_viewProjection');
        const viewProjectionInverse = device.scope.resolve('matrix_viewProjectionInverse');

        this.scene.debugLayer.onPreRenderOpaque = () => {
            if (this.visible) {
                device.setBlendState(BlendState.ALPHABLEND);
                device.setCullMode(CULLFACE_NONE);
                device.setDepthState(DepthState.WRITEDEPTH);
                device.setStencilState(null, null);

                // update viewProjectionInverse matrix
                const projectionMatrix = this.scene.camera.entity.camera.projectionMatrix;
                const cameraMatrix = this.scene.camera.entity.getWorldTransform();

                const mat = new Mat4();
                mat.invert(projectionMatrix);
                mat.mul2(cameraMatrix, mat);

                const mat2 = new Mat4();
                mat2.invert(mat);

                const viewPos = new Vec3();
                cameraMatrix.getTranslation(viewPos);

                viewPosition.setValue([viewPos.x, viewPos.y, viewPos.z]);
                viewProjection.setValue(mat2.data);
                viewProjectionInverse.setValue(mat.data);

                this.quadRender.render();
            }
        };
    }

    remove() {
        this.scene.debugLayer.onPreRenderOpaque = null;
    }

    serialize(serializer: Serializer): void {
        serializer.pack(this.visible);
    }
}

export { InfiniteGrid };
