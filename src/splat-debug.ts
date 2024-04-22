import {
    BLEND_NORMAL,
    GSplatData,
    Material,
    Mesh,
    MeshInstance,
    PRIMITIVE_POINTS,
    SEMANTIC_POSITION,
    createShaderFromCode,
} from 'playcanvas';
import { State } from './edit-ops';
import { Scene } from './scene';
import { Splat } from './splat';

const vs = /* glsl */ `
attribute vec4 vertex_position;

uniform mat4 matrix_model;
uniform mat4 matrix_view;
uniform mat4 matrix_projection;
uniform mat4 matrix_viewProjection;

uniform float splatSize;

varying vec4 color;

vec4 colors[3] = vec4[3](
    vec4(0, 0, 0, 0.25),
    vec4(0, 0, 1.0, 0.5),
    vec4(1.0, 1.0, 0.0, 0.5)
);

void main(void) {
    int state = int(vertex_position.w);
    if (state == -1) {
        gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    } else {
        gl_Position = matrix_viewProjection * matrix_model * vec4(vertex_position.xyz, 1.0);
        gl_PointSize = splatSize;
        color = colors[state];
    }
}
`;

const fs = /* glsl */ `
varying vec4 color;
void main(void)
{
    gl_FragColor = color;
}
`;

class SplatDebug {
    splatData: GSplatData;
    meshInstance: MeshInstance;
    size = 2;

    constructor(scene: Scene, splat: Splat, splatData: GSplatData) {
        const device = scene.graphicsDevice;

        const shader = createShaderFromCode(device, vs, fs, `splatDebugShader`, {
            vertex_position: SEMANTIC_POSITION
        });

        const material = new Material();
        material.name = 'splatDebugMaterial';
        material.blendType = BLEND_NORMAL;
        material.shader = shader;
        material.update();

        const x = splatData.getProp('x');
        const y = splatData.getProp('y');
        const z = splatData.getProp('z');

        const vertexData = new Float32Array(splatData.numSplats * 4);
        for (let i = 0; i < splatData.numSplats; ++i) {
            vertexData[i * 4 + 0] = x[i];
            vertexData[i * 4 + 1] = y[i];
            vertexData[i * 4 + 2] = z[i];
            vertexData[i * 4 + 3] = 1;
        }

        const mesh = new Mesh(device);
        mesh.setPositions(vertexData, 4);
        mesh.update(PRIMITIVE_POINTS, true);

        this.splatData = splatData;
        this.meshInstance = new MeshInstance(mesh, material, splat.root);

        this.splatSize = this.size;
    }

    update() {
        const splatData = this.splatData;
        const s = splatData.getProp('state') as Uint8Array;

        const vb = this.meshInstance.mesh.vertexBuffer;
        const vertexData = new Float32Array(vb.lock());

        let count = 0;

        for (let i = 0; i < splatData.numSplats; ++i) {
            if (!!(s[i] & State.deleted)) {
                // deleted
                vertexData[i * 4 + 3] = -1;
            } else if (!!(s[i] & State.hidden)) {
                // hidden
                vertexData[i * 4 + 3] = -1;
            } else if (!(s[i] & State.selected)) {
                // unselected
                vertexData[i * 4 + 3] = 1;
            } else {
                // selected
                vertexData[i * 4 + 3] = 2;
                count++;
            }
        }

        vb.unlock();

        return count;
    }

    set splatSize(splatSize: number) {
        this.size = splatSize;
        this.meshInstance.material.setParameter('splatSize', splatSize * window.devicePixelRatio);
    }

    get splatSize() {
        return this.size;
    }
}

export { SplatDebug };
