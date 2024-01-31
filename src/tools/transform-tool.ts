import { Entity, StandardMaterial } from 'playcanvas';
import { TransformGizmo } from 'playcanvas-extras';
import { ElementType } from '../element';
import { Scene } from '../scene';
import { Splat } from '../splat';
import { Events } from '../events';
import { EditHistory } from '../edit-history';
import { EntityTransformOp } from '../edit-ops';

const patchGizmoMaterials = (gizmo: TransformGizmo) => {
    const patch = (material: StandardMaterial) => {
        material.opacity = 0.8;
    };

    // patch opacity
    const axis = gizmo._materials.axis;
    patch(axis.x.cullBack);
    patch(axis.x.cullNone);
    patch(axis.y.cullBack);
    patch(axis.y.cullNone);
    patch(axis.z.cullBack);
    patch(axis.z.cullNone);
    patch(axis.face);
    patch(axis.xyz);

    const disabled = gizmo._materials.disabled;
    patch(disabled.cullBack);
    patch(disabled.cullNone);
};

class TransformTool {
    scene: Scene;
    gizmo: TransformGizmo;
    entities: Entity[] = [];
    ops: any[] = [];

    constructor(gizmo: TransformGizmo, events: Events, editHistory: EditHistory, scene: Scene) {
        this.scene = scene;
        this.gizmo = gizmo;

        // patch gizmo materials (until we have API to do this)
        patchGizmoMaterials(this.gizmo);

        this.gizmo.coordSpace = events.call('tool:coordSpace');

        this.gizmo.on('render:update', () => {
            scene.forceRender = true;
        });

        this.gizmo.on('transform:start', () => {
            this.ops = this.entities.map((entity) => {
                return {
                    entity: entity,
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
            scene.updateBound();
        });

        this.gizmo.on('transform:end', () => {
            // update new transforms
            this.ops.forEach((op) => {
                const e = op.entity;
                op.new.position.copy(e.getLocalPosition());
                op.new.rotation.copy(e.getLocalRotation());
                op.new.scale.copy(e.getLocalScale());
            });

            // filter out ops that didn't change
            this.ops = this.ops.filter((op) => {
                const e = op.entity;
                return !op.old.position.equals(e.getLocalPosition()) ||
                       !op.old.rotation.equals(e.getLocalRotation()) ||
                       !op.old.scale.equals(e.getLocalScale());
            });

            if (this.ops.length > 0) {
                editHistory.add(new EntityTransformOp(scene, this.ops));
                this.ops = [];
            }
        });

        events.on('edit:changed', () => {
            if (this.entities) {
                this.gizmo.attach(this.entities);
            }
        });

        events.on('tool:coordSpace', (coordSpace: string) => {
            this.gizmo.coordSpace = coordSpace;
            scene.forceRender = true;
        });
    }

    activate() {
        this.entities = this.scene.getElementsByType(ElementType.splat).map((splat: Splat) => splat.entity);
        this.gizmo.attach(this.entities);
    }

    deactivate() {
        this.gizmo.detach();
        this.entities = [];
    }
}

export { TransformTool };
