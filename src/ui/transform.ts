import { Container, ContainerArgs, Label, NumericInput, VectorInput } from 'pcui';
import { Quat, Vec3 } from 'playcanvas';

import { Events } from '../events';
import { localize } from './localization';
import { Pivot } from '../pivot';

const v = new Vec3();

class Transform extends Container {
    constructor(events: Events, args: ContainerArgs = {}) {
        args = {
            ...args,
            id: 'transform'
        };

        super(args);

        const axis = new Container({
            class: 'transform-row'
        });

        const axisLabel = new Label({
            class: 'transform-label',
            text: ''
        });

        const xLabel = new Label({
            class: ['transform-expand', 'transform-label', 'transform-axis-label'],
            text: 'x'
        });

        const yLabel = new Label({
            class: ['transform-expand', 'transform-label', 'transform-axis-label'],
            text: 'y'
        });

        const zLabel = new Label({
            class: ['transform-expand', 'transform-label', 'transform-axis-label'],
            text: 'z'
        });

        axis.append(axisLabel);
        axis.append(xLabel);
        axis.append(yLabel);
        axis.append(zLabel);

        // position
        const position = new Container({
            class: 'transform-row'
        });

        const positionLabel = new Label({
            class: 'transform-label',
            text: localize('position')
        });

        const positionVector = new VectorInput({
            class: 'transform-expand',
            precision: 2,
            dimensions: 3,
            value: [0, 0, 0],
            enabled: false
        });

        position.append(positionLabel);
        position.append(positionVector);

        // rotation
        const rotation = new Container({
            class: 'transform-row'
        });

        const rotationLabel = new Label({
            class: 'transform-label',
            text: localize('rotation')
        });

        const rotationVector = new VectorInput({
            class: 'transform-expand',
            precision: 2,
            dimensions: 3,
            value: [0, 0, 0],
            enabled: false
        });

        rotation.append(rotationLabel);
        rotation.append(rotationVector);

        // scale
        const scale = new Container({
            class: 'transform-row'
        });

        const scaleLabel = new Label({
            class: 'transform-label',
            text: localize('scale')
        });

        const scaleInput = new NumericInput({
            class: 'transform-expand',
            precision: 2,
            value: 1,
            min: 0.01,
            max: 10000,
            enabled: false
        });

        scale.append(scaleLabel);
        scale.append(scaleInput);

        this.append(axis);
        this.append(position);
        this.append(rotation);
        this.append(scale);

        const toArray = (v: Vec3) => {
            return [v.x, v.y, v.z];
        };

        let uiUpdating = false;
        let mouseUpdating = false;

        // update UI with pivot
        const updateUI = (pivot: Pivot) => {
            uiUpdating = true;
            const transform = pivot.transform;
            transform.rotation.getEulerAngles(v);
            positionVector.value = toArray(transform.position);
            rotationVector.value = toArray(v);
            scaleInput.value = transform.scale.x;
            uiUpdating = false;
        };

        // update pivot with UI
        const updatePivot = (pivot: Pivot) => {
            const p = positionVector.value;
            const r = rotationVector.value;
            const q = new Quat().setFromEulerAngles(r[0], r[1], r[2]);
            const s = scaleInput.value;

            if (q.w < 0) {
                q.mulScalar(-1);
            }

            pivot.moveTRS(new Vec3(p[0], p[1], p[2]), q, new Vec3(s, s, s));
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
