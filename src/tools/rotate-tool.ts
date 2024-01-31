import { RotateGizmo } from 'playcanvas-extras';
import { TransformTool } from './transform-tool';
import { Events } from '../events';
import { EditHistory } from '../edit-history';
import { Scene } from '../scene';

class RotateTool extends TransformTool {
    ToolName = 'Rotate';

    constructor(events: Events, editHistory: EditHistory, scene: Scene) {
        const gizmo = new RotateGizmo(scene.app, scene.camera.entity.camera, scene.gizmoLayer);

        super(gizmo, events, editHistory, scene);
    }
}

export { RotateTool };
