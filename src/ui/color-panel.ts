import { ColorPicker, Container, Label, SliderInput, SliderInputArgs } from 'pcui';
import { Events } from '../events';
import { Tooltips } from './tooltips';
import { localize } from './localization';
import { Splat } from '../splat';
import { SetSplatClrOp } from '../edit-ops';

// pcui slider doesn't include start and end events
class MyFancySliderInput extends SliderInput {
    constructor(args: SliderInputArgs) {
        super(args);
    }

    _onSlideStart(pageX: number) {
        super._onSlideStart(pageX);
        this.emit('slide:start');
    }

    _onSlideEnd(pageX: number) {
        super._onSlideEnd(pageX);
        this.emit('slide:end');
    }
};

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
            class: `panel-header-icon`,
            text: '\uE146'
        });

        const label = new Label({
            class: `panel-header-label`,
            text: localize('colors')
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

        const brightnessSlider = new MyFancySliderInput({
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

        let suppress = false;
        let selected: Splat = null;
        let op: SetSplatClrOp = null;

        const updateUI = (splat: Splat) => {
            if (suppress) return;
            suppress = true;
            ambientPicker.value = splat ? [splat.ambientClr.r, splat.ambientClr.g, splat.ambientClr.b] : [0, 0, 0];
            tintPicker.value = splat ? [splat.tintClr.r, splat.tintClr.g, splat.tintClr.b] : [1, 1, 1];
            brightnessSlider.value = Math.log(splat ? splat.brightness : 1) / 3 + 1;
            suppress = false;
        };

        const start = () => {
            if (selected) {
                op = new SetSplatClrOp({
                    splat: selected,
                    ambientClr: selected.ambientClr.clone(),
                    tintClr: selected.tintClr.clone(),
                    brightness: selected.brightness
                });
            }
        };

        const end = () => {
            if (op) {
                op.newAmbientClr.set(ambientPicker.value[0], ambientPicker.value[1], ambientPicker.value[2]);
                op.newTintClr.set(tintPicker.value[0], tintPicker.value[1], tintPicker.value[2]);
                op.newBrightness = Math.exp((brightnessSlider.value - 1) * 3);
                events.fire('edit.add', op);
                op = null;
            }
        };

        ambientPicker.on('picker:color:start', start);
        ambientPicker.on('picker:color:end', end);
        tintPicker.on('picker:color:start', start);
        tintPicker.on('picker:color:end', end);
        brightnessSlider.on('slide:start', start);
        brightnessSlider.on('slide:end', end);

        ambientPicker.on('change', (value: number[]) => {
            if (!suppress) {
                suppress = true;
                if (op) {
                    op.newAmbientClr.set(value[0], value[1], value[2]);
                    op.do();
                } else if (selected) {
                    start();
                    end();
                }
                suppress = false;
            }
        });

        tintPicker.on('change', (value: number[]) => {
            if (!suppress) {
                suppress = true;
                if (op) {
                    op.newTintClr.set(value[0], value[1], value[2]);
                    op.do();
                } else if (selected) {
                    start();
                    end();
                }
                suppress = false;
            }
        });

        brightnessSlider.on('change', (value: number) => {
            if (!suppress) {
                suppress = true;
                if (op) {
                    op.newBrightness = Math.exp((value - 1) * 3);
                    op.do();
                } else if (selected) {
                    start();
                    end();
                }
                suppress = false;
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
