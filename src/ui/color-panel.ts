import { Container, ContainerArgs, Label, NumericInput } from 'pcui';
import { Events } from '../events';
import { Splat } from '../splat';
import { EntityColorAdjustmentOp } from '../edit-ops';
import { localize } from './localization';

class ColorPanel extends Container {
    constructor(events: Events, args: ContainerArgs = {}) {
        args = {
            ...args,
            id: 'color-panel'
        };

        super(args);

        const brightness = new Container({
            class: 'color-row'
        });

        const brightnessLabel = new Label({
            class: 'color-label',
            text: localize('color.brightness')
        });

        const brightnessInput = new NumericInput({
            class: 'color-expand',
            precision: 2,
            value: 1.0,
            min: 0.0,
            max: 10.0,
            enabled: false
        });

        brightness.append(brightnessLabel);
        brightness.append(brightnessInput);

        const temperature = new Container({
            class: 'color-row'
        });

        const temperatureLabel = new Label({
            class: 'color-label',
            text: localize('color.temperature')
        });

        const temperatureInput = new NumericInput({
            class: 'color-expand',
            precision: 2,
            value: 0,
            min: -0.5,
            max: 0.5,
            enabled: false
        });

        temperature.append(temperatureLabel);
        temperature.append(temperatureInput);        
        
        const tint = new Container({
            class: 'color-row'
        });

        const tintLabel = new Label({
            class: 'color-label',
            text: localize('color.tint')
        });

        const tintInput = new NumericInput({
            class: 'color-expand',
            precision: 2,
            value: 0,
            max: 0.5,
            min: -0.5,
            enabled: false
        });

        tint.append(tintLabel);
        tint.append(tintInput);

        this.append(brightness);
        this.append(temperature);
        this.append(tint);

        let selection: Splat | null = null;

        let uiUpdating = false;

        const updateUI = () => {
            uiUpdating = true;
            brightnessInput.value = selection.colorAdjustment.brightness;
            temperatureInput.value = selection.colorAdjustment.temperature;
            tintInput.value = selection.colorAdjustment.tint;
            uiUpdating = false;
        };

        events.on('selection.changed', (splat) => {
            selection = splat;

            if (selection) {
                // enable inputs
                updateUI();
                temperatureInput.enabled = tintInput.enabled = brightnessInput.enabled = true;
            } else {
                // disable inputs
                temperatureInput.enabled = tintInput.enabled = brightnessInput.enabled = false;
            }
        });

        let op: EntityColorAdjustmentOp | null = null;
 
        const createOp = () => {
            op = new EntityColorAdjustmentOp({
                splat: selection,
                oldAdj: selection.colorAdjustment,
                newAdj: selection.colorAdjustment
            });
        };

        const updateOp = () => {
            op.newAdj = {
                brightness: brightnessInput.value,
                temperature: temperatureInput.value,
                tint: tintInput.value
            };

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

        [brightnessInput, temperatureInput, tintInput].forEach((input) => {
            input.on('change', change);
            input.on('slider:mousedown', mousedown);
            input.on('slider:mouseup', mouseup);
        });
    }
}

export { ColorPanel };
