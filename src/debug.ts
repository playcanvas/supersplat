import {
    BLEND_NONE,
    SEMANTIC_COLOR,
    SEMANTIC_POSITION,
    createShaderFromCode,
    GraphNode,
    Material,
    Mesh,
    MeshInstance,
    Shader,
} from 'playcanvas';
import { Element, ElementType } from './element';

const vertexShader = `
attribute vec3 vertex_position;
attribute vec4 vertex_color;

varying vec4 vColor;
varying vec2 vZW;

uniform mat4 matrix_model;
uniform mat4 matrix_viewProjection;

void main(void) {
    gl_Position = matrix_viewProjection * matrix_model * vec4(vertex_position, 1.0);

    // store z/w for later use in fragment shader
    vColor = vertex_color;
    vZW = gl_Position.zw;

    // disable depth clipping
    gl_Position.z = 0.0;
}`;

const fragmentShader = `
precision highp float;

varying vec4 vColor;
varying vec2 vZW;

void main(void) {
    gl_FragColor = vColor;

    // clamp depth in Z to [0, 1] range
    gl_FragDepth = max(0.0, min(1.0, (vZW.x / vZW.y + 1.0) * 0.5));
}`;

class Debug extends Element {
    shader: Shader;
    material: Material;
    instance: MeshInstance;

    constructor() {
        super(ElementType.debug);
    }

    destroy() {
        this.shader.destroy();
        this.material.destroy();
    }

    add() {
        const app = this.scene.app;
        const device = app.graphicsDevice;

        this.shader = createShaderFromCode(device, vertexShader, fragmentShader, 'debug-lines', {
            vertex_position: SEMANTIC_POSITION,
            vertex_color: SEMANTIC_COLOR
        });

        this.material = new Material();
        this.material.shader = this.shader;
        this.material.blendType = BLEND_NONE;
        this.material.update();
    }

    remove() {

    }

    set mesh(mesh: Mesh) {
        if (this.instance) {
            this.scene.debugLayer.removeMeshInstances([this.instance], true);
        }

        this.instance = new MeshInstance(mesh, this.material, new GraphNode());
        this.instance.cull = false;
        // this.instance.visible = true;
        this.scene.debugLayer.addMeshInstances([this.instance], true);
    }

    get mesh() {
        return this.instance?.mesh;
    }
}

export { Debug };
