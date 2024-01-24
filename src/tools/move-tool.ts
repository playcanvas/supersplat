import { GizmoTranslate } from 'playcanvas-extras';
import { ElementType } from '../element';
import { Scene } from '../scene';
import { Splat } from '../splat';
import { Events } from '../events';

class MoveTool {
    ToolName = 'Move';

    events: Events;
    scene: Scene;
    gizmo: GizmoTranslate;

    constructor(events: Events, scene: Scene) {
        this.events = events;
        this.scene = scene;

        this.gizmo = new GizmoTranslate(scene.app, scene.camera.entity.camera, scene.gizmoLayer);
    }

    activate() {
        const entities = this.scene.getElementsByType(ElementType.splat).map((splat: Splat) => splat.entity);
        this.gizmo.attach(entities);
    }

    deactivate() {
        this.gizmo.detach();
    }
}

export { MoveTool };
