import { TransformGizmo } from 'playcanvas';
import { Element } from '../element';
import { Scene } from '../scene';
import { Splat } from '../splat';
import { Events } from '../events';
import { EditHistory, EditOp } from '../edit-history';
import { EntityOp, EntityTransformOp } from '../edit-ops';

// patch gizmo to be more opaque
const patchGizmoMaterials = (gizmo: TransformGizmo) => {
    // @ts-ignore
    ['x', 'y', 'z', 'xyz', 'face'].forEach(name => { gizmo._meshColors.axis[name].a = 0.8; });
    // @ts-ignore
    gizmo._meshColors.disabled.a = 0.8;
};

class TransformTool {
    scene: Scene;
    gizmo: TransformGizmo;
    elements: Element[] = [];
    ops: EntityOp[] = [];
    events: Events;
    active = false;

    constructor(gizmo: TransformGizmo, events: Events, editHistory: EditHistory, scene: Scene) {
        this.scene = scene;
        this.gizmo = gizmo;
        this.events = events;

        // patch gizmo materials (until we have API to do this)
        patchGizmoMaterials(this.gizmo);

        this.gizmo.coordSpace = events.invoke('tool.coordSpace');
        this.gizmo.size = 0.9;

        this.gizmo.on('render:update', () => {
            scene.forceRender = true;
        });

        this.gizmo.on('transform:start', () => {
            this.ops = this.elements.map((element) => {
                const entity = element.entity;

                return {
                    element: element,
                    old: {
                        position: entity.getLocalPosition().clone(),
                        rotation: entity.getLocalRotation().clone(),
                        scale: entity.getLocalScale().clone()
                    },
                    new: {
                        position: entity.getLocalPosition().clone(),
                        rotation: entity.getLocalRotation().clone(),
                        scale: entity.getLocalScale().clone()
                    }
                }
            });
        });

        this.gizmo.on('transform:move', () => {
            scene.boundDirty = true;
        });

        this.gizmo.on('transform:end', () => {
            // update new transforms
            this.ops.forEach((op) => {
                const e = op.element.entity;
                op.new.position.copy(e.getLocalPosition());
                op.new.rotation.copy(e.getLocalRotation());
                op.new.scale.copy(e.getLocalScale());
            });

            // filter out ops that didn't change
            this.ops = this.ops.filter((op) => {
                const e = op.element.entity;
                return !op.old.position.equals(e.getLocalPosition()) ||
                       !op.old.rotation.equals(e.getLocalRotation()) ||
                       !op.old.scale.equals(e.getLocalScale());
            });

            if (this.ops.length > 0) {
                editHistory.add(new EntityTransformOp(scene, this.ops));
                this.ops = [];
            }
        });

        events.on('scene.boundChanged', (editOp: EditOp) => {
            if (this.elements) {
                this.gizmo.attach(this.elements.map((element) => element.entity));
            }
        });

        events.on('tool.coordSpace', (coordSpace: string) => {
            this.gizmo.coordSpace = coordSpace;
            scene.forceRender = true;
        });

        events.on('selection.changed', (selection: Splat) => {
            this.update();
        });
    }

    update() {
        if (!this.active) {
            this.gizmo.detach();
            this.elements = [];
            return;
        }

        const selection = this.events.invoke('selection');
        if (!selection) {
            this.gizmo.detach();
            this.elements = [];
            return;
        }

        this.elements = [selection];
        this.gizmo.attach(this.elements.map((element) => element.entity));
    }

    activate() {
        this.active = true;
        this.update();
    }

    deactivate() {
        this.active = false;
        this.update();
    }
}

export { TransformTool };
