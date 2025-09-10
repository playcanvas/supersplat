import { ScaleGizmo } from 'playcanvas';

import { TransformTool } from './transform-tool';
import { Events } from '../events';
import { Scene } from '../scene';

class ScaleTool extends TransformTool {
    constructor(events: Events, scene: Scene) {
        const gizmo = new ScaleGizmo(scene.camera.entity.camera, scene.gizmoLayer);

        // disable everything except uniform scale
        ['x', 'y', 'z', 'yz', 'xz', 'xy'].forEach((axis) => {
            gizmo.enableShape(axis as 'x' | 'y' | 'z' | 'yz' | 'xz' | 'xy', false);
        });

        // set lower bound on scale
        gizmo.lowerBoundScale.set(1e-6, 1e-6, 1e-6);

        super(gizmo, events, scene);
    }
}

export { ScaleTool };
