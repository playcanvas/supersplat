import { Button, Container, Label, NumericInput, VectorInput } from '@playcanvas/pcui';
import { TranslateGizmo, Vec3 } from 'playcanvas';

import { Events } from '../events';
import { Scene } from '../scene';
import { SphereShape } from '../sphere-shape';
import { Splat } from '../splat';
import { i18n } from '../ui/localization';

class SphereSelection {
    activate: () => void;
    deactivate: () => void;

    active = false;

    constructor(events: Events, scene: Scene, canvasContainer: Container) {
        const sphere = new SphereShape();

        const gizmo = new TranslateGizmo(scene.camera.camera, scene.gizmoLayer);

        gizmo.on('render:update', () => {
            scene.forceRender = true;
        });

        gizmo.on('transform:move', () => {
            sphere.moved();
        });

        // ui
        const selectToolbar = new Container({
            class: 'select-toolbar',
            hidden: true
        });

        selectToolbar.dom.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
        });

        const setButton = new Button({ class: 'select-toolbar-button' });
        const addButton = new Button({ class: 'select-toolbar-button' });
        const removeButton = new Button({ class: 'select-toolbar-button' });
        const intersectButton = new Button({ class: 'select-toolbar-button' });

        i18n.bindText(setButton, 'select-toolbar.set');
        i18n.bindText(addButton, 'select-toolbar.add');
        i18n.bindText(removeButton, 'select-toolbar.remove');
        i18n.bindText(intersectButton, 'select-toolbar.intersect');

        const positionLabel = new Label({ class: 'select-toolbar-label' });
        i18n.bindText(positionLabel, 'select-toolbar.position');

        const position = new VectorInput({
            class: 'select-toolbar-vector',
            precision: 2,
            dimensions: 3,
            placeholder: ['X', 'Y', 'Z'],
            value: [0, 0, 0]
        });

        const radiusLabel = new Label({ class: 'select-toolbar-label' });
        i18n.bindText(radiusLabel, 'select-toolbar.radius');

        const radius = new NumericInput({
            precision: 2,
            value: sphere.radius,
            width: 80,
            min: 0.01
        });

        selectToolbar.append(setButton);
        selectToolbar.append(addButton);
        selectToolbar.append(removeButton);
        selectToolbar.append(intersectButton);
        selectToolbar.append(positionLabel);
        selectToolbar.append(position);
        selectToolbar.append(radiusLabel);
        selectToolbar.append(radius);

        canvasContainer.append(selectToolbar);

        // write the volume's world position into the ui without retriggering
        // the position input's change handler
        let uiUpdating = false;
        const updateUI = () => {
            uiUpdating = true;
            const p = sphere.pivot.getPosition();
            position.value = [p.x, p.y, p.z];
            uiUpdating = false;
        };

        gizmo.on('transform:move', () => {
            updateUI();
        });

        const apply = (op: 'set' | 'add' | 'remove' | 'intersect') => {
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
        intersectButton.dom.addEventListener('pointerdown', (e) => {
            e.stopPropagation(); apply('intersect');
        });
        position.inputs.forEach((input) => {
            input.on('change', () => {
                if (!uiUpdating) {
                    const v = position.value;
                    sphere.pivot.setPosition(v[0], v[1], v[2]);
                    sphere.moved();
                    gizmo.attach([sphere.pivot]);
                }
            });
        });
        radius.on('change', () => {
            sphere.radius = radius.value;
        });

        events.on('camera.focalPointPicked', (details: { splat: Splat, position: Vec3 }) => {
            if (this.active) {
                sphere.pivot.setPosition(details.position);
                gizmo.attach([sphere.pivot]);
                updateUI();
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
            updateUI();
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
