import { Button, Container, NumericInput } from 'pcui';
import { TranslateGizmo, Vec3 } from 'playcanvas';

import { Events } from '../events';
import { Scene } from '../scene';
import { SphereShape } from '../sphere-shape';
import { Splat } from '../splat';

class SphereSelection {
    activate: () => void;
    deactivate: () => void;

    active = false;

    constructor(events: Events, scene: Scene, canvasContainer: Container) {
        const sphere = new SphereShape();

        const gizmo = new TranslateGizmo(scene.camera.entity.camera, scene.gizmoLayer);

        gizmo.on('render:update', () => {
            scene.forceRender = true;
        });

        gizmo.on('transform:move', () => {
            sphere.moved();
        });

        // ui
        const selectToolbar = new Container({
            id: 'select-toolbar',
            hidden: true
        });

        selectToolbar.dom.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
        });

        const setButton = new Button({ text: 'Set', class: 'select-toolbar-button' });
        const addButton = new Button({ text: 'Add', class: 'select-toolbar-button' });
        const removeButton = new Button({ text: 'Remove', class: 'select-toolbar-button' });
        const radius = new NumericInput({
            precision: 2,
            value: sphere.radius,
            placeholder: 'Radius',
            width: 80,
            min: 0.01
        });

        selectToolbar.append(setButton);
        selectToolbar.append(addButton);
        selectToolbar.append(removeButton);
        selectToolbar.append(radius);

        canvasContainer.append(selectToolbar);

        const apply = (op: 'set' | 'add' | 'remove') => {
            const p = sphere.pivot.getPosition();
            events.fire('select.bySphere', op, [p.x, p.y, p.z, sphere.radius]);
        };

        setButton.dom.addEventListener('pointerdown', (e) => {
            e.stopPropagation(); apply('set');
        });
        addButton.dom.addEventListener('pointerdown', (e) => {
            e.stopPropagation(); apply('add');
        });
        removeButton.dom.addEventListener('pointerdown', (e) => {
            e.stopPropagation(); apply('remove');
        });
        radius.on('change', () => {
            sphere.radius = radius.value;
        });

        events.on('camera.focalPointPicked', (details: { splat: Splat, position: Vec3 }) => {
            if (this.active) {
                sphere.pivot.setPosition(details.position);
                gizmo.attach([sphere.pivot]);
            }
        });

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
            this.active = true;
            scene.add(sphere);
            gizmo.attach([sphere.pivot]);
            selectToolbar.hidden = false;
        };

        this.deactivate = () => {
            selectToolbar.hidden = true;
            gizmo.detach();
            scene.remove(sphere);
            this.active = false;
        };
    }
}

export { SphereSelection };
