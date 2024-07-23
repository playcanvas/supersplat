import { Container, Label, NumericInput, Panel, PanelArgs, VectorInput } from 'pcui';
import { Quat, Vec3 } from 'playcanvas';
import { Events } from '../events';
import { Splat } from '../splat';

class TransformPanel extends Panel {
    constructor(events: Events, args: PanelArgs = {}) {
        args = {
            id: 'transform-panel',
            class: 'control-panel',
            headerText: 'TRANSFORM',
            ...args
        };

        super(args);

        const axis = new Container({
            class: 'control-parent'
        });

        const axisLabel = new Label({
            class: 'control-label',
            text: ''
        });

        const xLabel = new Label({
            class: ['control-element-expand', 'transform-panel-axis-label'],
            text: 'x'
        });

        const yLabel = new Label({
            class: ['control-element-expand', 'transform-panel-axis-label'],
            text: 'y'
        });

        const zLabel = new Label({
            class: ['control-element-expand', 'transform-panel-axis-label'],
            text: 'z'
        });

        axis.append(axisLabel);
        axis.append(xLabel);
        axis.append(yLabel);
        axis.append(zLabel);

        // position
        const position = new Container({
            class: 'control-parent'
        });

        const positionLabel = new Label({
            class: 'control-label',
            text: 'Position'
        });

        const positionVector = new VectorInput({
            class: 'control-element-expand',
            precision: 2,
            dimensions: 3,
            value: [0, 0, 0],
            enabled: false
        });

        position.append(positionLabel);
        position.append(positionVector);

        // rotation
        const rotation = new Container({
            class: 'control-parent'
        });

        const rotationLabel = new Label({
            class: 'control-label',
            text: 'Rotation'
        });

        const rotationVector = new VectorInput({
            class: 'control-element-expand',
            precision: 2,
            dimensions: 3,
            value: [0, 0, 0],
            enabled: false
        });

        rotation.append(rotationLabel);
        rotation.append(rotationVector);

        // scale
        const scale = new Container({
            class: 'control-parent'
        });

        const scaleLabel = new Label({
            class: 'control-label',
            text: 'Scale'
        });

        const scaleInput = new NumericInput({
            class: 'control-element-expand',
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

        let selection: Splat | null = null;

        const toArray = (v: Vec3) => {
            return [v.x, v.y, v.z];
        };

        const toVec3 = (a: number[]) => {
            return new Vec3(a[0], a[1], a[2]);
        };

        let uiUpdating = false;

        const updateUI = () => {
            uiUpdating = true;
            positionVector.value = toArray(selection.pivot.getLocalPosition());
            rotationVector.value = toArray(selection.pivot.getLocalEulerAngles());
            scaleInput.value = selection.pivot.getLocalScale().x;
            uiUpdating = false;
        };

        events.on('selection.changed', (splat) => {
            selection = splat;

            if (selection) {
                // enable inputs
                updateUI();
                positionVector.enabled = rotationVector.enabled = scaleInput.enabled = true;
            } else {
                // enable inputs
                positionVector.enabled = rotationVector.enabled = scaleInput.enabled = false;
            }
        });

        events.on('splat.moved', (splat: Splat) => {
            if (splat === selection) {
                updateUI();
            }
        });

        positionVector.on('change', () => {
            if (!uiUpdating) {
                selection.move(toVec3(positionVector.value), null, null);
            }
        });

        rotationVector.on('change', () => {
            if (!uiUpdating) {
                const v = rotationVector.value;
                selection.move(null, new Quat().setFromEulerAngles(v[0], v[1], v[2]), null);
            }
        });

        scaleInput.on('change', () => {
            if (!uiUpdating) {
                selection.move(null, null, toVec3([scaleInput.value, scaleInput.value, scaleInput.value]));
            }
        });
    }
}

export { TransformPanel };
