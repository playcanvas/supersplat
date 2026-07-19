import { Button, Container, Element, Label, NumericInput, VectorInput } from '@playcanvas/pcui';
import { Vec3 } from 'playcanvas';

import { ShapeGizmoMode, ShapeTransformGizmo } from './shape-transform-gizmo';
import { ShapeTransformOp } from '../edit-ops';
import { Events } from '../events';
import { Scene } from '../scene';
import { ShortcutManager } from '../shortcut-manager';
import { SphereShape } from '../sphere-shape';
import { Splat } from '../splat';
import { i18n } from '../ui/localization';
import addSvg from '../ui/svg/select-add.svg';
import intersectSvg from '../ui/svg/select-intersect.svg';
import removeSvg from '../ui/svg/select-remove.svg';
import setSvg from '../ui/svg/select-set.svg';
import { Tooltips } from '../ui/tooltips';

const createSvg = (svgString: string) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

class SphereSelection {
    activate: () => void;
    deactivate: () => void;
    setTransformMode: (mode: Exclude<ShapeGizmoMode, 'none'>) => boolean;

    active = false;

    constructor(events: Events, scene: Scene, canvasContainer: Container, tooltips: Tooltips) {
        const sphere = new SphereShape();

        // ui
        const selectToolbar = new Container({
            class: 'select-toolbar',
            hidden: true
        });

        selectToolbar.dom.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
        });

        const translateButton = new Button({ class: 'select-toolbar-mode', icon: 'E111' });
        const scaleButton = new Button({ class: 'select-toolbar-mode', icon: 'E112' });

        const setButton = new Button({ class: 'select-toolbar-op' });
        const addButton = new Button({ class: 'select-toolbar-op' });
        const removeButton = new Button({ class: 'select-toolbar-op' });
        const intersectButton = new Button({ class: 'select-toolbar-op' });

        setButton.dom.appendChild(createSvg(setSvg));
        addButton.dom.appendChild(createSvg(addSvg));
        removeButton.dom.appendChild(createSvg(removeSvg));
        intersectButton.dom.appendChild(createSvg(intersectSvg));

        // icon-only buttons need localized accessible names
        i18n.onChange(() => {
            setButton.dom.setAttribute('aria-label', i18n.t('select-toolbar.set'));
            addButton.dom.setAttribute('aria-label', i18n.t('select-toolbar.add'));
            removeButton.dom.setAttribute('aria-label', i18n.t('select-toolbar.remove'));
            intersectButton.dom.setAttribute('aria-label', i18n.t('select-toolbar.intersect'));
        }, setButton);

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
            min: 0.01
        });

        selectToolbar.append(translateButton);
        selectToolbar.append(scaleButton);
        selectToolbar.append(new Element({ class: 'select-toolbar-separator' }));
        selectToolbar.append(setButton);
        selectToolbar.append(addButton);
        selectToolbar.append(removeButton);
        selectToolbar.append(intersectButton);
        selectToolbar.append(positionLabel);
        selectToolbar.append(position);
        selectToolbar.append(radiusLabel);
        selectToolbar.append(radius);

        canvasContainer.append(selectToolbar);

        // write the volume's transform into the ui without retriggering the
        // inputs' change handlers
        let uiUpdating = false;
        const updateUI = () => {
            uiUpdating = true;
            const p = sphere.pivot.getPosition();
            position.value = [p.x, p.y, p.z];
            radius.value = sphere.radius;
            uiUpdating = false;
        };

        const syncModeUI = (mode: ShapeGizmoMode) => {
            translateButton.class[mode === 'translate' ? 'add' : 'remove']('active');
            scaleButton.class[mode === 'scale' ? 'add' : 'remove']('active');
        };

        // undo/redo support for volume transforms
        const captureState = () => ({
            position: sphere.pivot.getPosition().clone(),
            radius: sphere.radius
        });

        type SphereState = ReturnType<typeof captureState>;

        const statesEqual = (a: SphereState, b: SphereState) => {
            return a.position.equals(b.position) && a.radius === b.radius;
        };

        const addOp = (oldState: SphereState, newState: SphereState) => {
            if (!statesEqual(oldState, newState)) {
                // the change is already applied, so suppress the op's do()
                events.fire('edit.add', new ShapeTransformOp({ shape: sphere, oldState, newState }), true);
            }
        };

        // record an undo op for the state change performed by fn
        const recordOp = (fn: () => void) => {
            const oldState = captureState();
            fn();
            addOp(oldState, captureState());
        };

        let dragState: SphereState | null = null;

        const gizmo = new ShapeTransformGizmo(events, scene, {
            rotate: false,
            uniformScale: true,
            lowerBoundScale: new Vec3(0.02, 0.02, 0.02),
            onTransformStart: () => {
                dragState = captureState();
            },
            onTransform: (mode) => {
                if (mode === 'scale') {
                    // the pivot's uniform scale is the sphere's diameter;
                    // the radius setter refreshes the bound
                    sphere.radius = sphere.pivot.getLocalScale().x * 0.5;
                } else {
                    sphere.moved();
                }
                updateUI();
            },
            onTransformEnd: () => {
                if (dragState) {
                    addOp(dragState, captureState());
                    dragState = null;
                }
            },
            onModeChanged: syncModeUI
        });
        syncModeUI(gizmo.mode);

        this.setTransformMode = (mode) => {
            gizmo.toggleMode(mode);
            return true;
        };

        const apply = (op: 'set' | 'add' | 'remove' | 'intersect') => {
            events.fire('select.bySphere', op, sphere.pivot.getWorldTransform().clone());
        };

        translateButton.dom.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            gizmo.toggleMode('translate');
        });
        scaleButton.dom.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            gizmo.toggleMode('scale');
        });
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
        position.on('change', (v: number[]) => {
            if (!uiUpdating) {
                recordOp(() => {
                    sphere.pivot.setPosition(v[0], v[1], v[2]);
                    sphere.moved();
                });
                gizmo.attach(sphere.pivot);
            }
        });
        radius.on('change', () => {
            if (!uiUpdating) {
                recordOp(() => {
                    sphere.radius = radius.value;
                });
            }
        });

        events.on('camera.focalPointPicked', (details: { splat: Splat, position: Vec3 }) => {
            if (this.active) {
                recordOp(() => {
                    sphere.pivot.setPosition(details.position);
                    sphere.moved();
                });
                gizmo.attach(sphere.pivot);
                updateUI();
            }
        });

        // refresh the ui when undo/redo changes the volume while the tool is active
        events.on('shapeSelection.changed', (shape: unknown) => {
            if (this.active && shape === sphere) {
                updateUI();
            }
        });

        // compose localized tooltip text with the shortcut key
        const shortcutManager: ShortcutManager = events.invoke('shortcutManager');
        const tooltip = (localeKey: string, shortcutId: string) => () => {
            const text = i18n.t(localeKey);
            const shortcut = shortcutManager.formatShortcut(shortcutId);
            return shortcut ? i18n.formatTooltipWithShortcut(text, shortcut) : text;
        };

        tooltips.register(translateButton, tooltip('tooltip.bottom-toolbar.move', 'tool.moveShortcut'), 'top');
        tooltips.register(scaleButton, tooltip('tooltip.bottom-toolbar.scale', 'tool.scaleShortcut'), 'top');
        tooltips.register(setButton, () => i18n.t('select-toolbar.set'), 'top');
        tooltips.register(addButton, () => i18n.t('select-toolbar.add'), 'top');
        tooltips.register(removeButton, () => i18n.t('select-toolbar.remove'), 'top');
        tooltips.register(intersectButton, () => i18n.t('select-toolbar.intersect'), 'top');

        this.activate = () => {
            this.active = true;
            scene.add(sphere);
            if (gizmo.mode === 'none') {
                gizmo.setMode('translate');
            }
            gizmo.attach(sphere.pivot);
            updateUI();
            selectToolbar.hidden = false;
        };

        this.deactivate = () => {
            selectToolbar.hidden = true;
            gizmo.detach();
            scene.remove(sphere);
            this.active = false;

            // the volume is transient tool state: drop its ops from history so
            // undo/redo never hits steps that visibly change nothing while the
            // tool is hidden
            events.fire('edit.removeForShape', sphere);
        };
    }
}

export { SphereSelection };
