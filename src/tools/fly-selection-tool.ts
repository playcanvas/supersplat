import { Ray, Vec3, BoundingSphere, Mat4, Vec4 } from 'playcanvas';
import { Events } from '../events';
import { Scene } from '../scene';
import { Splat } from '../splat';
import { EditOp, SelectOp } from '../edit-ops'; // Import SelectOp
import { ElementType } from '../element';
import { State } from '../splat-state'; // Import State

const ray = new Ray();
const cameraPos = new Vec3();
const splatPos = new Vec3();
const splatSphere = new BoundingSphere();
const gaussianPos = new Vec3(); // For individual gaussian world position
const gaussianVec4 = new Vec4(); // For transform
const mat = new Mat4(); // For transform

class FlySelectionTool {
    events: Events;
    scene: Scene;
    active = false;
    // Store splats and the indices of gaussians within them to select
    gaussiansToSelect: Map<Splat, number[]> = new Map();
    selectionRadius = 0.1; // Radius around camera to check for gaussians

    constructor(events: Events, scene: Scene) {
        this.events = events;
        this.scene = scene;

        // Bind the update method to this instance
        this.update = this.update.bind(this);
    }

    activate() {
        this.active = true;
        // Add update listener when activated
        this.scene.app.on('update', this.update);
        console.log('Fly Selection Tool Activated');
    }

    deactivate() {
        this.active = false;
        // Remove update listener when deactivated
        this.scene.app.off('update', this.update);
        console.log('Fly Selection Tool Deactivated');
    }

    update(deltaTime: number) {
        if (!this.active) return;

        const camera = this.scene.camera.entity;
        cameraPos.copy(camera.getPosition());

        this.gaussiansToSelect.clear();

        const splats = this.scene.getElementsByType(ElementType.splat) as Splat[];
        if (!splats || splats.length === 0) return;

        for (let i = 0; i < splats.length; ++i) {
            const splat = splats[i];
            if (!splat.visible || !splat.splatData) continue;

            // Broad phase: Check if camera is roughly near the splat
            splatPos.copy(splat.worldBound.center);
            // Use selectionRadius here
            const radius = splat.worldBound.halfExtents.length() + this.selectionRadius;
            splatSphere.center.copy(splatPos);
            splatSphere.radius = radius;

            if (!splatSphere.containsPoint(cameraPos)) {
                continue; // Skip splat if camera is too far
            }

            // Narrow phase: Check individual gaussians
            const splatData = splat.splatData;
            const x = splatData.getProp('x');
            const y = splatData.getProp('y');
            const z = splatData.getProp('z');
            const state = splatData.getProp('state'); // Get state data
            const indicesToSelect: number[] = [];
            const worldTransform = splat.worldTransform;

            for (let j = 0; j < splatData.numSplats; ++j) {
                // Check if gaussian is already deleted, hidden, or selected
                const currentState = state[j];
                if (currentState & (State.deleted | State.hidden | State.selected)) continue;

                // Get gaussian world position
                gaussianVec4.set(x[j], y[j], z[j], 1.0);
                worldTransform.transformVec4(gaussianVec4, gaussianVec4);
                gaussianPos.set(gaussianVec4.x, gaussianVec4.y, gaussianVec4.z);

                // Check distance to camera
                // Use selectionRadius here
                if (gaussianPos.distance(cameraPos) < this.selectionRadius) {
                    indicesToSelect.push(j);
                }
            }

            if (indicesToSelect.length > 0) {
                this.gaussiansToSelect.set(splat, indicesToSelect);
            }
        }

        if (this.gaussiansToSelect.size > 0) {
            let totalGaussians = 0;
            this.gaussiansToSelect.forEach((indices, splat) => {
                totalGaussians += indices.length;
                // Create a Set for efficient lookup in the predicate
                const indicesSet = new Set(indices);
                const predicate = (i: number) => indicesSet.has(i);
                // Fire 'select.pred' event with 'add' operation and the predicate
                this.events.fire('select.pred', 'add', predicate);
            });
            console.log(`Selected ${totalGaussians} gaussians across ${this.gaussiansToSelect.size} splats via fly-by`);

            // Clear the map after firing the events
            this.gaussiansToSelect.clear();

            // Selection changes usually trigger renders automatically, so forceRender might not be needed.
            // this.scene.forceRender = true;
        }
    }
}

// Rename the export
export { FlySelectionTool };
