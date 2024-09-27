import { Container, ContainerArgs, Label, NumericInput, Panel, PanelArgs, VectorInput } from 'pcui';
import { Quat, Vec3 } from 'playcanvas';
import { Events } from '../events';
import { Splat } from '../splat';
import { EntityTransformOp } from '../edit-ops';
import { localize } from './localization';

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

        let op: EntityTransformOp | null = null;

        const createOp = () => {
            const p = selection.pivot.getLocalPosition();
            const r = selection.pivot.getLocalRotation();
            const s = selection.pivot.getLocalScale();

            op = new EntityTransformOp({
                splat: selection,
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
        };

        const updateOp = () => {
            const n = op.newt;

            const p = positionVector.value;
            n.position.x = p[0];
            n.position.y = p[1];
            n.position.z = p[2];

            const r = rotationVector.value;
            const q = new Quat().setFromEulerAngles(r[0], r[1], r[2]);
            n.rotation.copy(q);

            const s = scaleInput.value;
            n.scale.x = s;
            n.scale.y = s;
            n.scale.z = s;

            op.do();
        };

        const submitOp = () => {
            events.fire('edit.add', op);
            op = null;
        };

        const change = () => {
            if (!uiUpdating) {
                if (op) {
                    updateOp();
                } else {
                    createOp();
                    updateOp();
                    submitOp();
                }
            }
        };

        const mousedown = () => {
            createOp();
        };

        const mouseup = () => {
            updateOp();
            submitOp();
        };

        [positionVector.inputs, rotationVector.inputs, scaleInput].flat().forEach((input) => {
            input.on('change', change);
            input.on('slider:mousedown', mousedown);
            input.on('slider:mouseup', mouseup);
        });
    }
}

export { Transform };
