import { RotateGizmo } from 'playcanvas';

import { TransformTool } from './transform-tool';
import { EditHistory } from '../edit-history';
import { Events } from '../events';
import { Scene } from '../scene';

class RotateTool extends TransformTool {
    constructor(events: Events, scene: Scene) {
        const gizmo = new RotateGizmo(scene.camera.entity.camera, scene.gizmoLayer);

        super(gizmo, events, scene);
    }
}

export { RotateTool };
