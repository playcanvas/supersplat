import { ScaleGizmo } from 'playcanvas';

import { TransformTool } from './transform-tool';
import { EditHistory } from '../edit-history';
import { Events } from '../events';
import { Scene } from '../scene';

class ScaleTool extends TransformTool {
    constructor(events: Events, scene: Scene) {
        const gizmo = new ScaleGizmo(scene.camera.entity.camera, scene.gizmoLayer);

        // disable everything except uniform scale
        ['x', 'y', 'z', 'yz', 'xz', 'xy'].forEach((axis) => {
            gizmo.enableShape(axis, false);
        });

        super(gizmo, events, scene);
    }
}

export { ScaleTool };
