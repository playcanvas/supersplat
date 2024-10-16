import { Entity, GraphicsDevice, TransformGizmo } from 'playcanvas';
import { Scene } from '../scene';
import { Events } from '../events';
import { Pivot } from '../pivot';

// patch gizmo to be more opaque
const patchGizmoMaterials = (gizmo: TransformGizmo) => {
    // @ts-ignore
    ['x', 'y', 'z', 'xyz', 'face'].forEach(name => { gizmo._meshColors.axis[name].a = 0.8; });
    // @ts-ignore
    gizmo._meshColors.disabled.a = 0.8;
};

// set the gizmo size to remain a constant size in screen space.
// called in response to changes in canvas size
const updateGizmoSize = (gizmo: TransformGizmo, device: GraphicsDevice) => {
    const canvas = document.getElementById('canvas');
    if (canvas) {
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        gizmo.size = 1200 / Math.max(w, h);

        // FIXME:
        // this is a temporary workaround to undo gizmo's own auto scaling.
        // once gizmo's autoscaling code is removed, this line can go too.
        // @ts-ignore
        gizmo._deviceStartSize = Math.min(device.width, device.height);
    }
};

class TransformTool {
    activate: () => void;
    deactivate: () => void;

    constructor(gizmo: TransformGizmo, events: Events, scene: Scene) {
        let pivot: Pivot;
        let active = false;

        // create the transform pivot
        const pivotEntity = new Entity('gizmoPivot');
        scene.app.root.addChild(pivotEntity);

        gizmo.on('render:update', () => {
            scene.forceRender = true;
        });

        gizmo.on('transform:start', () => {
            pivot.start();
        });

        gizmo.on('transform:move', () => {
            pivot.moveTRS(pivotEntity.getLocalPosition(), pivotEntity.getLocalRotation(), pivotEntity.getLocalScale());
        });

        gizmo.on('transform:end', () => {
            pivot.end();
        });

        // reattach the gizmo to the pivot
        const reattach = () => {
            if (!active || !events.invoke('selection')) {
                gizmo.detach();
            } else {
                pivot = events.invoke('pivot') as Pivot;
                pivotEntity.setLocalPosition(pivot.transform.position);
                pivotEntity.setLocalRotation(pivot.transform.rotation);
                pivotEntity.setLocalScale(pivot.transform.scale);
                gizmo.attach([pivotEntity]);
            }
        };

        events.on('tool.coordSpace', (coordSpace: string) => {
            gizmo.coordSpace = coordSpace;
            scene.forceRender = true;
        });

        events.on('pivot.placed', reattach);
        events.on('pivot.moved', reattach);
        events.on('selection.changed', reattach);

        events.on('camera.resize', () => {
            scene.events.on('camera.resize', () => updateGizmoSize(gizmo, scene.graphicsDevice));
        });

        this.activate = () => {
            active = true;
            reattach();
        };

        this.deactivate = () => {
            active = false;
            reattach();
        };

        // update gizmo size
        updateGizmoSize(gizmo, scene.graphicsDevice);

        // patch gizmo materials (until we have API to do this)
        patchGizmoMaterials(gizmo);

        // initialize coodinate space
        gizmo.coordSpace = events.invoke('tool.coordSpace');
    }
}

export { TransformTool };
