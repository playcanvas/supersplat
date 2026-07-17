import {
    BLENDEQUATION_ADD,
    BLENDMODE_ONE,
    BLENDMODE_ONE_MINUS_SRC_ALPHA,
    BLENDMODE_SRC_ALPHA,
    CULLFACE_NONE,
    PRIMITIVE_TRIANGLES,
    BlendState,
    Entity,
    Mesh,
    MeshInstance,
    ShaderMaterial,
    Vec3
} from 'playcanvas';

import { Element, ElementType } from './element';
import { Serializer } from './serializer';
import { vertexShader, fragmentShader } from './shaders/orient-plane-shader';

const points = [new Vec3(), new Vec3(), new Vec3()];
const positions = new Array<number>(9);

// the orient tool's plane triangle, rendered in the scene with dithered depth
// (like the grid and selection shapes) so gaussians occlude it and vice versa
class OrientPlane extends Element {
    entity: Entity;
    mesh: Mesh;
    material: ShaderMaterial;

    // fills the world-space triangle corners, returning true if the plane is defined
    supplier: (points: Vec3[]) => boolean = () => false;

    constructor() {
        super(ElementType.debug);
        this.entity = new Entity('orientPlane');
    }

    add() {
        if (!this.material) {
            const material = new ShaderMaterial({
                uniqueName: 'orientPlane',
                vertexGLSL: vertexShader,
                fragmentGLSL: fragmentShader
            });
            material.cull = CULLFACE_NONE;
            material.blendState = new BlendState(
                true,
                BLENDEQUATION_ADD, BLENDMODE_SRC_ALPHA, BLENDMODE_ONE_MINUS_SRC_ALPHA,
                BLENDEQUATION_ADD, BLENDMODE_ONE, BLENDMODE_ONE_MINUS_SRC_ALPHA
            );
            material.update();

            const mesh = new Mesh(this.scene.graphicsDevice);
            mesh.setPositions([0, 0, 0, 0, 0, 0, 0, 0, 0]);
            mesh.update(PRIMITIVE_TRIANGLES);

            this.entity.addComponent('render', {
                meshInstances: [new MeshInstance(mesh, material)]
            });
            this.entity.render.layers = [this.scene.worldLayer.id];
            this.entity.render.meshInstances[0].visible = false;

            this.mesh = mesh;
            this.material = material;
        }

        this.scene.contentRoot.addChild(this.entity);
    }

    remove() {
        this.scene.contentRoot.removeChild(this.entity);
    }

    serialize(serializer: Serializer): void {
        const visible = this.supplier(points);
        serializer.pack(visible);
        if (visible) {
            points.forEach(p => serializer.packVec3(p));
        }
    }

    onPreRender() {
        const visible = this.supplier(points);
        const meshInstance = this.entity.render.meshInstances[0];

        meshInstance.visible = visible;

        if (visible) {
            for (let i = 0; i < 3; i++) {
                positions[i * 3 + 0] = points[i].x;
                positions[i * 3 + 1] = points[i].y;
                positions[i * 3 + 2] = points[i].z;
            }
            this.mesh.setPositions(positions);
            this.mesh.update(PRIMITIVE_TRIANGLES);
        }
    }
}

export { OrientPlane };
