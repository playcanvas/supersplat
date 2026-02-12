import {
    PRIMITIVE_LINES,
    Entity,
    Mesh,
    MeshInstance,
    ShaderMaterial,
    Vec3
} from 'playcanvas';

import { Element, ElementType } from './element';
import { vertexShader, fragmentShader } from './shaders/debug-shader';

// temp vectors for frustum geometry calculation (module-scope to avoid allocations)
const tmpForward = new Vec3();
const tmpRight = new Vec3();
const tmpUp = new Vec3();
const tmpBase = new Vec3();
const tmpTL = new Vec3();
const tmpTR = new Vec3();
const tmpBL = new Vec3();
const tmpBR = new Vec3();
const tmpUpTip = new Vec3();

// lines per camera icon: 4 pyramid + 4 base rect + 2 up indicator = 10
const LINES_PER_CAMERA = 10;
const VERTS_PER_CAMERA = LINES_PER_CAMERA * 2;

class CameraPoseGizmos extends Element {
    entity: Entity;
    mesh: Mesh;
    material: ShaderMaterial;
    meshInstance: MeshInstance;
    dirty = true;

    constructor() {
        super(ElementType.debug);
    }

    add() {
        const scene = this.scene;
        const device = scene.graphicsDevice;

        this.material = new ShaderMaterial({
            uniqueName: 'cameraPoseGizmoMaterial',
            vertexGLSL: vertexShader,
            fragmentGLSL: fragmentShader
        });
        this.material.depthWrite = true;
        this.material.depthTest = true;
        this.material.update();

        this.mesh = new Mesh(device);
        this.mesh.primitive[0] = {
            baseVertex: 0,
            type: PRIMITIVE_LINES,
            base: 0,
            count: 0
        };

        this.meshInstance = new MeshInstance(this.mesh, this.material, null);
        this.meshInstance.cull = false;

        this.entity = new Entity('cameraPoseGizmos');
        this.entity.addComponent('render', {
            meshInstances: [this.meshInstance],
            layers: [scene.worldLayer.id]
        });

        scene.app.root.addChild(this.entity);

        // mark dirty when poses or scene bound change
        const markDirty = () => {
            this.dirty = true;
            if (scene.events.invoke('camera.showPoses')) {
                scene.forceRender = true;
            }
        };
        const { events } = scene;
        events.on('track.keyAdded', markDirty);
        events.on('track.keyRemoved', markDirty);
        events.on('track.keyMoved', markDirty);
        events.on('track.keyUpdated', markDirty);
        events.on('track.keysCleared', markDirty);
        events.on('track.keysLoaded', markDirty);
        events.on('scene.boundChanged', markDirty);
    }

    destroy() {
        this.entity?.destroy();
    }

    onPreRender() {
        const { scene } = this;
        const visible = scene.events.invoke('camera.showPoses') && scene.camera.renderOverlays;

        this.entity.enabled = visible;

        if (visible && this.dirty) {
            this.dirty = false;
            this.rebuildMesh();
        }
    }

    private rebuildMesh() {
        const poses = this.scene.events.invoke('camera.poses') as { position: Vec3, target: Vec3 }[];
        if (!poses || poses.length === 0) {
            this.mesh.primitive[0].count = 0;
            return;
        }

        const boundSize = this.scene.bound.halfExtents.length();
        const iconScale = boundSize > 0 ? boundSize * 0.04 : 0.2;

        const depth = iconScale * 2;
        const halfW = iconScale * 1.2;
        const halfH = iconScale * 0.9;

        const numVerts = poses.length * VERTS_PER_CAMERA;
        const positions: number[] = [];
        const colors = new Uint8Array(numVerts * 4);

        const pushLine = (a: Vec3, b: Vec3) => {
            positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
        };

        for (const pose of poses) {
            const { position, target } = pose;

            // forward direction
            tmpForward.sub2(target, position).normalize();

            // right direction (handle degenerate case when looking straight up/down)
            if (Math.abs(tmpForward.y) > 0.999) {
                tmpRight.cross(tmpForward, Vec3.BACK).normalize();
            } else {
                tmpRight.cross(tmpForward, Vec3.UP).normalize();
            }

            // up direction
            tmpUp.cross(tmpRight, tmpForward);

            // base center (in front of camera position)
            tmpBase.copy(position).addScaled(tmpForward, depth);

            // frustum corners
            tmpTL.copy(tmpBase).addScaled(tmpUp, halfH).addScaled(tmpRight, -halfW);
            tmpTR.copy(tmpBase).addScaled(tmpUp, halfH).addScaled(tmpRight, halfW);
            tmpBL.copy(tmpBase).addScaled(tmpUp, -halfH).addScaled(tmpRight, -halfW);
            tmpBR.copy(tmpBase).addScaled(tmpUp, -halfH).addScaled(tmpRight, halfW);

            // pyramid edges from position to corners
            pushLine(position, tmpTL);
            pushLine(position, tmpTR);
            pushLine(position, tmpBL);
            pushLine(position, tmpBR);

            // base rectangle
            pushLine(tmpTL, tmpTR);
            pushLine(tmpTR, tmpBR);
            pushLine(tmpBR, tmpBL);
            pushLine(tmpBL, tmpTL);

            // up indicator triangle
            tmpUpTip.copy(tmpBase).addScaled(tmpUp, halfH * 1.5);
            pushLine(tmpTL, tmpUpTip);
            pushLine(tmpTR, tmpUpTip);
        }

        // fill vertex colors with cyan (0, 255, 255, 255)
        for (let i = 0; i < numVerts; i++) {
            const off = i * 4;
            colors[off] = 0;
            colors[off + 1] = 255;
            colors[off + 2] = 255;
            colors[off + 3] = 255;
        }

        this.mesh.setPositions(positions);
        this.mesh.setColors32(colors);
        this.mesh.update(PRIMITIVE_LINES);
    }
}

export { CameraPoseGizmos };
