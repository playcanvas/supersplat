import { Color } from 'playcanvas';
import { ColorPicker, Container, Label, SliderInput } from 'pcui';
import { Events } from '../events';
import { Tooltips } from './tooltips';
import { localize } from './localization';
import { Splat } from '../splat';
import { SetSplatClrOp } from '../edit-ops';

class ColorPanel extends Container {
    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'color-panel',
            class: 'panel',
            hidden: true
        };

        super(args);

        // stop pointer events bubbling
        ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick'].forEach((eventName) => {
            this.dom.addEventListener(eventName, (event: Event) => event.stopPropagation());
        });

        // header

        const header = new Container({
            class: `panel-header`
        });

        const icon = new Label({
            text: '\uE403',
            class: `panel-header-icon`
        });

        const label = new Label({
            text: localize('colors'),
            class: `panel-header-label`
        });

        header.append(icon);
        header.append(label);

        // ambient 

        const ambientRow = new Container({
            class: 'color-panel-row'
        });

        const ambientLabel = new Label({
            text: localize('colors.ambient'),
            class: 'color-panel-row-label'
        });

        const ambientPicker = new ColorPicker({
            class: 'color-panel-row-picker',
            value: [0, 0, 0]
        });

        ambientRow.append(ambientLabel);
        ambientRow.append(ambientPicker);

        // tint
        const tintRow = new Container({
            class: 'color-panel-row'
        });

        const tintLabel = new Label({
            text: localize('colors.tint'),
            class: 'color-panel-row-label'
        });

        const tintPicker = new ColorPicker({
            class: 'color-panel-row-picker',
            value: [1, 1, 1]
        });

        tintRow.append(tintLabel);
        tintRow.append(tintPicker);

        // brightness

        const brightnessRow = new Container({
            class: 'color-panel-row'
        });

        const brightnessLabel = new Label({
            text: localize('colors.brightness'),
            class: 'color-panel-row-label'
        });

        const brightnessSlider = new SliderInput({
            class: 'color-panel-row-slider',
            min: 0,
            max: 3,
            step: 0.1,
            value: 1
        });

        brightnessRow.append(brightnessLabel);
        brightnessRow.append(brightnessSlider);

        this.append(header);
        this.append(ambientRow);
        this.append(tintRow);
        this.append(brightnessRow);

        // handle ui updates

        const updateUI = (splat: Splat) => {
            ambientPicker.value = splat ? [splat.ambientClr.r, splat.ambientClr.g, splat.ambientClr.b] : [0, 0, 0];
            tintPicker.value = splat ? [splat.tintClr.r, splat.tintClr.g, splat.tintClr.b] : [1, 1, 1];
            brightnessSlider.value = Math.log(splat ? splat.brightness : 1) / 3 + 1;
        };

        let selected: Splat = null;

        ambientPicker.on('change', (value: number[]) => {
            if (selected) {
                events.fire('edit.add', new SetSplatClrOp({
                    splat: selected,
                    ambientClr: new Color(value[0], value[1], value[2])
                }));
            }
        });

        tintPicker.on('change', (value: number[]) => {
            if (selected) {
                events.fire('edit.add', new SetSplatClrOp({
                    splat: selected,
                    tintClr: new Color(value[0], value[1], value[2])
                }));
            }
        });

        brightnessSlider.on('change', (value: number) => {
            if (selected) {
                events.fire('edit.add', new SetSplatClrOp({
                    splat: selected,
                    brightness: Math.exp((value - 1) * 3)
                }));
            }
        });

        events.on('selection.changed', (splat) => {
            selected = splat;
            updateUI(splat);
        });

        events.on('splat.ambientClr', (splat: Splat) => {
            updateUI(splat);
        });

        events.on('splat.tintClr', (splat: Splat) => {
            updateUI(splat);
        });

        events.on('splat.brightness', (splat: Splat) => {
            updateUI(splat);
        });

        // handle panel visibility

        const setVisible = (visible: boolean) => {
            if (visible === this.hidden) {
                this.hidden = !visible;
                events.fire('colorPanel.visible', visible);
            }
        };

        events.function('colorPanel.visible', () => {
            return !this.hidden;
        });

        events.on('colorPanel.setVisible', (visible: boolean) => {
            setVisible(visible);
        });

        events.on('colorPanel.toggleVisible', () => {
            setVisible(this.hidden);
        });

        events.on('cameraPanel.visible', (visible: boolean) => {
            if (visible) {
                setVisible(false);
            }
        });

        events.on('viewPanel.visible', (visible: boolean) => {
            if (visible) {
                setVisible(false);
            }
        });
    }
}

export { ColorPanel };
