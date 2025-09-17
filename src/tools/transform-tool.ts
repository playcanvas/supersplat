import { Entity, GraphicsDevice, TransformGizmo } from 'playcanvas';

import { Events } from '../events';
import { Pivot } from '../pivot';
import { Scene } from '../scene';

class TransformTool {
    activate: () => void;
    deactivate: () => void;

    constructor(gizmo: TransformGizmo, events: Events, scene: Scene) {
        let pivot: Pivot;
        let active = false;
        let dragging = false;

        // create the transform pivot
        const pivotEntity = new Entity('gizmoPivot');
        scene.app.root.addChild(pivotEntity);

        gizmo.on('render:update', () => {
            scene.forceRender = true;
        });

        gizmo.on('transform:start', () => {
            dragging = true;
            pivot.start();
        });

        gizmo.on('transform:move', () => {
            pivot.moveTRS(pivotEntity.getLocalPosition(), pivotEntity.getLocalRotation(), pivotEntity.getLocalScale());
            scene.forceRender = true;
        });

        gizmo.on('transform:end', () => {
            pivot.end();
            dragging = false;
        });

        // reattach the gizmo to the pivot
        const reattach = () => {
            if (!active || !events.invoke('selection')) {
                if (gizmo.enabled) {
                    gizmo.detach();
                }
            } else if (!dragging) {
                pivot = events.invoke('pivot') as Pivot;
                pivotEntity.setLocalPosition(pivot.transform.position);
                pivotEntity.setLocalRotation(pivot.transform.rotation);
                pivotEntity.setLocalScale(pivot.transform.scale);
                gizmo.attach([pivotEntity]);
            }
        };

        events.on('tool.coordSpace', (coordSpace: string) => {
            gizmo.coordSpace = coordSpace as 'local' | 'world';
        });

        // set the gizmo size to remain a constant size in screen space.
        // called in response to changes in canvas size
        const updateGizmoSize = () => {
            const { camera, canvas } = scene;
            if (camera.ortho) {
                gizmo.size = 1125 / canvas.clientHeight;
            } else {
                gizmo.size = 1200 / Math.max(canvas.clientWidth, canvas.clientHeight);
            }
        };
        updateGizmoSize();
        events.on('camera.resize', updateGizmoSize);
        events.on('camera.ortho', updateGizmoSize);

        this.activate = () => {
            active = true;

            reattach();

            events.on('pivot.placed', reattach);
            events.on('pivot.moved', reattach);
            events.on('selection.changed', reattach);
        };

        this.deactivate = () => {
            active = false;
            reattach();

            events.off('pivot.placed', reattach);
            events.off('pivot.moved', reattach);
            events.off('selection.changed', reattach);
        };

        // initialize coodinate space
        gizmo.coordSpace = events.invoke('tool.coordSpace');
    }
}

export { TransformTool };
