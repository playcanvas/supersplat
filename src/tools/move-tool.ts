import { TranslateGizmo } from 'playcanvas';
import { TransformTool } from './transform-tool';
import { Events } from '../events';
import { EditHistory } from '../edit-history';
import { Scene } from '../scene';

class MoveTool extends TransformTool {
    constructor(events: Events, editHistory: EditHistory, scene: Scene) {
        const gizmo = new TranslateGizmo(scene.app, scene.camera.entity.camera, scene.gizmoLayer);

        super(gizmo, events, editHistory, scene);
    }
}

export { MoveTool };
