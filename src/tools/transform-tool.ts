import { Entity, GraphicsDevice, TransformGizmo, Vec3 } from 'playcanvas';
import { Scene } from '../scene';
import { Splat } from '../splat';
import { Events } from '../events';
import { EntityTransform, SetPivotOp } from '../edit-ops';
import { TransformTarget } from '../transform-target';

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
        let active = false;
        let target: TransformTarget = null;

        // create the transform pivot
        const pivot = new Entity('gizmoPivot');
        scene.app.root.addChild(pivot);

        gizmo.on('render:update', () => {
            scene.forceRender = true;
        });

        gizmo.on('transform:start', () => {
            target.start();
        });

        gizmo.on('transform:move', () => {
            target.update(pivot.getLocalPosition(), pivot.getLocalRotation(), pivot.getLocalScale());
        });

        gizmo.on('transform:end', () => {
            target.end();
        });

        // reattach the gizmo to the pivot
        const reattach = () => {
            target = events.invoke('transformTarget') as TransformTarget;

            if (!active || !target) {
                gizmo.detach();
            } else {
                pivot.setLocalPosition(target.pivot.position);
                pivot.setLocalRotation(target.pivot.rotation);
                pivot.setLocalScale(target.pivot.scale);
                gizmo.attach([pivot]);
            }
        };

        events.on('tool.coordSpace', (coordSpace: string) => {
            gizmo.coordSpace = coordSpace;
            scene.forceRender = true;
        });

        events.on('transformTarget.changed', reattach);
        events.on('transformTarget.moved', reattach);

        events.on('camera.resize', () => {
            scene.events.on('camera.resize', () => updateGizmoSize(gizmo, scene.graphicsDevice));
        });

        events.on('camera.focalPointPicked', (details: { splat: Splat, position: Vec3 }) => {
            if (active) {
                const op = new SetPivotOp(details.splat, details.splat.pivot.getLocalPosition().clone(), details.position.clone());
                events.fire('edit.add', op);
            }
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
