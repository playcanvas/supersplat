import { Ray, Vec3, BoundingSphere } from 'playcanvas';
import { Events } from '../events';
import { Scene } from '../scene';
import { Splat } from '../splat';
import { EditOp } from '../edit-ops';
import { ElementType } from '../element'; // Import ElementType

const ray = new Ray();
const cameraPos = new Vec3();
const splatPos = new Vec3();
const splatSphere = new BoundingSphere();

class FlyDeletionTool {
    events: Events;
    scene: Scene;
    active = false;
    splatsToDelete: Splat[] = [];

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
        console.log('Fly Deletion Tool Activated');
    }

    deactivate() {
        this.active = false;
        // Remove update listener when deactivated
        this.scene.app.off('update', this.update);
        console.log('Fly Deletion Tool Deactivated');
    }

    update(deltaTime: number) {
        if (!this.active) return;

        const camera = this.scene.camera.entity;
        cameraPos.copy(camera.getPosition());

        this.splatsToDelete.length = 0;

        // Get all splat elements from the scene
        const splats = this.scene.getElementsByType(ElementType.splat) as Splat[];
        if (!splats || splats.length === 0) return;

        for (let i = 0; i < splats.length; ++i) {
            const splat = splats[i];

            // Skip if splat is not visible or already deleted/hidden (optional check)
            if (!splat.visible) continue;

            // Use splat's world position and approximate radius
            // TODO: Need a reliable way to get splat world position and size
            // Using splat.worldBound for position for now
            splatPos.copy(splat.worldBound.center);
            const radius = 0.1; // Placeholder radius - adjust as needed
            splatSphere.center.copy(splatPos);
            splatSphere.radius = radius;

            // Check if camera position is inside the splat's bounding sphere
            if (splatSphere.containsPoint(cameraPos)) {
                this.splatsToDelete.push(splat);
            }
        }

        if (this.splatsToDelete.length > 0) {
            console.log(`Deleting ${this.splatsToDelete.length} splats`);
            // Use the existing edit history system
            this.events.fire('edit.deleteSplats', this.splatsToDelete);

            // Clear the list after firing the event
            this.splatsToDelete.length = 0;

            // Force render to see the change immediately
            this.scene.forceRender = true;
        }
    }
}

export { FlyDeletionTool };
