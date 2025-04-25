import {
    SEMANTIC_COLOR,
    SEMANTIC_POSITION,
    BlendState,
    GraphNode,
    Mesh,
    MeshInstance,
    ShaderMaterial
} from 'playcanvas';

import { Element, ElementType } from './element';
import { vertexShader, fragmentShader } from './shaders/debug-shader';

class Debug extends Element {
    material: ShaderMaterial;
    instance: MeshInstance;

    constructor() {
        super(ElementType.debug);
    }

    destroy() {
        this.material.destroy();
    }

    add() {
        const app = this.scene.app;
        const device = app.graphicsDevice;

        this.material = new ShaderMaterial({
            uniqueName: 'debugLines',
            attributes: {
                vertex_position: SEMANTIC_POSITION,
                vertex_color: SEMANTIC_COLOR
            },
            vertexCode: vertexShader,
            fragmentCode: fragmentShader
        });
        this.material.blendState = BlendState.NOBLEND;
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
        this.scene.debugLayer.addMeshInstances([this.instance], true);
    }

    get mesh() {
        return this.instance?.mesh;
    }
}

export { Debug };
