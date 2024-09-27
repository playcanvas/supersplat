import { Entity, GraphicsDevice, TransformGizmo, Vec3 } from 'playcanvas';
import { Scene } from '../scene';
import { Splat } from '../splat';
import { Events } from '../events';
import { EditOp, EntityTransformOp, SetPivotOp } from '../edit-ops';

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

const copyTransform = (target: Entity, source: Entity) => {
    target.setLocalPosition(source.getLocalPosition());
    target.setLocalRotation(source.getLocalRotation());
    target.setLocalScale(source.getLocalScale());
};

class TransformTool {
    activate: () => void;
    deactivate: () => void;

    constructor(gizmo: TransformGizmo, events: Events, scene: Scene) {
        let active = false;
        let target: Splat = null;
        let op: EntityTransformOp = null;

        // create the transform pivot
        const pivot = new Entity('gizmoPivot');
        scene.app.root.addChild(pivot);

        gizmo.on('transform:start', () => {
            const p = pivot.getLocalPosition().clone();
            const r = pivot.getLocalRotation().clone();
            const s = pivot.getLocalScale().clone();

            // create a new op instance on start
            op = new EntityTransformOp({
                splat: target,
                oldt: {
                    position: p.clone(),
                    rotation: r.clone(),
                    scale: s.clone()
                },
                newt: {
                    position: p.clone(),
                    rotation: r.clone(),
                    scale: s.clone()
                }
            });
        });

        gizmo.on('render:update', () => {
            scene.forceRender = true;
        });

        gizmo.on('transform:move', () => {
            copyTransform(target.pivot, pivot);
            target.worldBoundDirty = true;
            scene.boundDirty = true;
        });

        gizmo.on('transform:end', () => {
            const p = pivot.getLocalPosition();
            const r = pivot.getLocalRotation();
            const s = pivot.getLocalScale();

            // update new transforms
            if (!p.equals(op.oldt.position) ||
                !r.equals(op.oldt.rotation) ||
                !s.equals(op.oldt.scale)) {

                op.newt.position.copy(p);
                op.newt.rotation.copy(r);
                op.newt.scale.copy(s);

                events.fire('edit.add', op);
            }

            op = null;
        });

        // reattach the gizmo to the pivot
        const reattach = () => {
            const selection = events.invoke('selection') as Splat;

            if (!active || !selection) {
                gizmo.detach();
                target = null;
            } else {
                target = selection;
                copyTransform(pivot, target.pivot);
                gizmo.attach([pivot]);
            }
        };

        events.on('tool.coordSpace', (coordSpace: string) => {
            gizmo.coordSpace = coordSpace;
            scene.forceRender = true;
        });

        events.on('scene.boundChanged', reattach);
        events.on('selection.changed', reattach);
        events.on('splat.moved', reattach);

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
        }

        this.deactivate = () => {
            active = false;
            reattach();
        }

        // update gizmo size
        updateGizmoSize(gizmo, scene.graphicsDevice);

        // patch gizmo materials (until we have API to do this)
        patchGizmoMaterials(gizmo);

        // initialize coodinate space
        gizmo.coordSpace = events.invoke('tool.coordSpace');
    }
}

export { TransformTool };
