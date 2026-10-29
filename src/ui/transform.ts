import { NumericInput, VectorInput } from '@playcanvas/pcui';
import { Quat, Vec3 } from 'playcanvas';

import type { Events } from '../events';
import type { Pivot } from '../pivot';

import type { ClipboardMenu, ClipboardSource } from './clipboard-menu';
import { numberField, vectorField } from './clipboard-menu';
import { PanelSection } from './panel-section';


const v = new Vec3();

class Transform extends PanelSection {
    constructor(events: Events, clipboardMenu: ClipboardMenu) {
        super({
            id: 'transform',
            icon: '',
            localeKey: 'panel.scene.transform'
        });

        const positionVector = new VectorInput({
            precision: 3,
            dimensions: 3,
            placeholder: ['X', 'Y', 'Z'],
            value: [0, 0, 0],
            enabled: false
        });

        const rotationVector = new VectorInput({
            precision: 2,
            dimensions: 3,
            placeholder: ['X', 'Y', 'Z'],
            value: [0, 0, 0],
            enabled: false
        });

        const scaleInput = new NumericInput({
            class: 'transform-scale',
            precision: 3,
            value: 1,
            min: 0.001,
            max: 10000,
            enabled: false
        });

        const positionRow = this.addRow('panel.scene.transform.position', positionVector);
        const rotationRow = this.addRow('panel.scene.transform.rotation', rotationVector);
        const scaleRow = this.addRow('panel.scene.transform.scale', scaleInput);

        const toArray = (v: Vec3) => {
            return [v.x, v.y, v.z];
        };

        let uiUpdating = false;
        let mouseUpdating = false;

        // the panel shows the pivot in world coordinates. with a user-defined
        // local frame set (see Splat.getPivot), the pivot is that frame, so
        // zeroing the values aligns the frame with the world origin and axes
        const updateUI = (pivot: Pivot) => {
            uiUpdating = true;
            const transform = pivot.transform;
            transform.rotation.getEulerAngles(v);
            positionVector.value = toArray(transform.position);
            rotationVector.value = toArray(v);
            scaleInput.value = transform.scale.x;
            uiUpdating = false;
        };

        // pivot TRS from position, euler rotation (degrees) and uniform scale
        const toTRS = (p: number[], r: number[], s: number): [Vec3, Quat, Vec3] => {
            const q = new Quat().setFromEulerAngles(r[0], r[1], r[2]);

            if (q.w < 0) {
                q.mulScalar(-1);
            }

            return [new Vec3(p[0], p[1], p[2]), q, new Vec3(s, s, s)];
        };

        // update pivot with UI
        const updatePivot = (pivot: Pivot) => {
            pivot.moveTRS(...toTRS(positionVector.value, rotationVector.value, scaleInput.value));
        };

        // handle a change in the UI state
        const change = () => {
            if (!uiUpdating) {
                const pivot = events.invoke('pivot') as Pivot;
                if (mouseUpdating) {
                    updatePivot(pivot);
                } else {
                    pivot.start();
                    updatePivot(pivot);
                    pivot.end();
                }
            }
        };

        const mousedown = () => {
            mouseUpdating = true;
            const pivot = events.invoke('pivot') as Pivot;
            pivot.start();
        };

        const mouseup = () => {
            const pivot = events.invoke('pivot') as Pivot;
            updatePivot(pivot);
            mouseUpdating = false;
            pivot.end();
        };

        [positionVector.inputs, rotationVector.inputs, scaleInput].flat().forEach((input) => {
            input.on('change', change);
            input.on('slider:mousedown', mousedown);
            input.on('slider:mouseup', mouseup);
        });

        // copy/paste reads and writes the pivot directly rather than the
        // inputs, which round to their display precision. A paste is a single
        // pivot move, so a single undo step
        const pivotTRS = () => {
            const transform = (events.invoke('pivot') as Pivot).transform;
            return {
                position: toArray(transform.position),
                rotation: toArray(transform.rotation.getEulerAngles(new Vec3())),
                scale: transform.scale.x
            };
        };

        const clipboard: ClipboardSource = {
            fields: {
                position: vectorField(() => pivotTRS().position, 3),
                rotation: vectorField(() => pivotTRS().rotation, 3),
                scale: numberField(() => pivotTRS().scale, 0.001, 10000)
            },
            apply: (values) => {
                const { position, rotation, scale } = { ...pivotTRS(), ...values } as ReturnType<typeof pivotTRS>;
                const trs = toTRS(position, rotation, scale);
                const pivot = events.invoke('pivot') as Pivot;
                // an unchanged pivot fires no move, so the transform handlers
                // would record their previous transform as a new undo step
                if (!pivot.transform.equalsTRS(...trs)) {
                    pivot.start();
                    pivot.moveTRS(...trs);
                    pivot.end();
                }
            },
            enabled: () => positionVector.enabled
        };

        clipboardMenu.register(this.header, clipboard);
        clipboardMenu.register(positionRow, clipboard, 'position');
        clipboardMenu.register(rotationRow, clipboard, 'rotation');
        clipboardMenu.register(scaleRow, clipboard, 'scale');

        // toggle ui availability based on selection
        events.on('selection.changed', (selection) => {
            positionVector.enabled = rotationVector.enabled = scaleInput.enabled = !!selection;
        });

        events.on('pivot.placed', (pivot: Pivot) => {
            updateUI(pivot);
        });

        events.on('pivot.moved', (pivot: Pivot) => {
            if (!mouseUpdating) {
                updateUI(pivot);
            }
        });

        events.on('pivot.ended', (pivot: Pivot) => {
            updateUI(pivot);
        });
    }
}

export { Transform };
