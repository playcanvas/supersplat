import { TranslateGizmo } from 'playcanvas';

import type { Events } from '../events';
import type { Scene } from '../scene';

import { TransformTool } from './transform-tool';

class MoveTool extends TransformTool {
    constructor(events: Events, scene: Scene) {
        const gizmo = new TranslateGizmo(scene.camera.camera, scene.gizmoLayer);

        super(gizmo, events, scene);
    }
}

export { MoveTool };
