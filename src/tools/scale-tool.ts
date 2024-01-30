import { ScaleGizmo } from 'playcanvas-extras';
import { TransformTool } from './transform-tool';
import { Events } from '../events';
import { EditHistory } from '../edit-history';
import { Scene } from '../scene';

class ScaleTool extends TransformTool {
    ToolName = 'Scale';

    constructor(events: Events, editHistory: EditHistory, scene: Scene) {
        const gizmo = new ScaleGizmo(scene.app, scene.camera.entity.camera, scene.gizmoLayer);

        // disable everything except uniform scale
        ['x', 'y', 'z', 'yz', 'xz', 'xy'].forEach((axis) => {
            gizmo.enableShape(axis, false);
        });

        super(gizmo, events, editHistory, scene);
    }
}

export { ScaleTool };
