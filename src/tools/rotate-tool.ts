import { RotateGizmo } from 'playcanvas';

import type { Events } from '../events';
import type { Scene } from '../scene';

import { TransformTool } from './transform-tool';

class RotateTool extends TransformTool {
    constructor(events: Events, scene: Scene) {
        const gizmo = new RotateGizmo(scene.camera.camera, scene.gizmoLayer);
        gizmo.rotationMode = 'orbit';

        super(gizmo, events, scene);
    }
}

export { RotateTool };
