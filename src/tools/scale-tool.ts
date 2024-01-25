import { ScaleGizmo } from 'playcanvas-extras';
import { TransformTool } from './transform-tool';
import { Events } from '../events';
import { EditHistory } from '../edit-history';
import { Scene } from '../scene';

class ScaleTool extends TransformTool {
    ToolName = 'Scale';

    constructor(events: Events, editHistory: EditHistory, scene: Scene) {
        const gizmo = new ScaleGizmo(scene.app, scene.camera.entity.camera, scene.gizmoLayer);

        gizmo.uniform = true;

        super(gizmo, events, editHistory, scene);
    }
}

export { ScaleTool };
