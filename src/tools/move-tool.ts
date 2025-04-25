import { TranslateGizmo } from 'playcanvas';

import { TransformTool } from './transform-tool';
import { Events } from '../events';
import { Scene } from '../scene';

class MoveTool extends TransformTool {
    constructor(events: Events, scene: Scene) {
        const gizmo = new TranslateGizmo(scene.camera.entity.camera, scene.gizmoLayer);

        super(gizmo, events, scene);
    }
}

export { MoveTool };
