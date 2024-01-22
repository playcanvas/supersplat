import {
    BLEND_NORMAL,
    Material,
    Mesh,
    MeshInstance,
    PRIMITIVE_POINTS,
    SEMANTIC_POSITION,
    createShaderFromCode,
} from 'playcanvas';
import { deletedOpacity } from './edit-ops';
import { Scene } from './scene';
import { Splat } from './splat';
import { SplatData } from 'playcanvas-extras';

const vs = /* glsl */ `
attribute vec4 vertex_position;

uniform mat4 matrix_model;
uniform mat4 matrix_view;
uniform mat4 matrix_projection;
uniform mat4 matrix_viewProjection;

uniform float splatSize;

varying vec4 color;

void main(void) {
    if (vertex_position.w == -1.0) {
        gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    } else {
        gl_Position = matrix_viewProjection * matrix_model * vec4(vertex_position.xyz, 1.0);
        gl_PointSize = splatSize;
        float opacity = vertex_position.w;
        color = (opacity == -1.0) ? vec4(0) : mix(vec4(0, 0, 1.0, 0.5), vec4(1.0, 1.0, 0.0, 0.5), opacity);
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
    splatData: SplatData;
    meshInstance: MeshInstance;
    size = 2;

    constructor(scene: Scene, splat: Splat, splatData: SplatData) {
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
        const s = splatData.getProp('selection');

        const vertexData = new Float32Array(splatData.numSplats * 4);
        for (let i = 0; i < splatData.numSplats; ++i) {
            vertexData[i * 4 + 0] = x[i];
            vertexData[i * 4 + 1] = y[i];
            vertexData[i * 4 + 2] = z[i];
            vertexData[i * 4 + 3] = s[i];
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
        const s = splatData.getProp('selection');
        const o = splatData.getProp('opacity');

        const vb = this.meshInstance.mesh.vertexBuffer;
        const vertexData = new Float32Array(vb.lock());

        let count = 0;

        for (let i = 0; i < splatData.numSplats; ++i) {
            const selection = o[i] === deletedOpacity ? -1 : s[i];
            vertexData[i * 4 + 3] = selection;
            count += selection === 1 ? 1 : 0;
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
