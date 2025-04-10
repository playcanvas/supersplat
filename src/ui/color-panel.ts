import { ColorPicker, Container, Label, SliderInput, SliderInputArgs } from 'pcui';
import { Color } from 'playcanvas';

import { Events } from '../events';
import { localize } from './localization';
import { Tooltips } from './tooltips';
import { SetSplatColorAdjustmentOp } from '../edit-ops';
import { Splat } from '../splat';

// pcui slider doesn't include start and end events
class MyFancySliderInput extends SliderInput {
    _onSlideStart(pageX: number) {
        super._onSlideStart(pageX);
        this.emit('slide:start');
    }

    _onSlideEnd(pageX: number) {
        super._onSlideEnd(pageX);
        this.emit('slide:end');
    }
}

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
            class: 'panel-header'
        });

        const icon = new Label({
            class: 'panel-header-icon',
            text: '\uE146'
        });

        const label = new Label({
            class: 'panel-header-label',
            text: localize('colors')
        });

        header.append(icon);
        header.append(label);

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

        // temperature

        const temperatureRow = new Container({
            class: 'color-panel-row'
        });

        const temperatureLabel = new Label({
            text: localize('colors.temperature'),
            class: 'color-panel-row-label'
        });

        const temperatureSlider = new MyFancySliderInput({
            class: 'color-panel-row-slider',
            min: -0.5,
            max: 0.5,
            step: 0.005,
            value: 0
        });

        temperatureRow.append(temperatureLabel);
        temperatureRow.append(temperatureSlider);

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
            min: -1,
            max: 1,
            step: 0.1,
            value: 1
        });

        brightnessRow.append(brightnessLabel);
        brightnessRow.append(brightnessSlider);

        // black point

        const blackPointRow = new Container({
            class: 'color-panel-row'
        });

        const blackPointLabel = new Label({
            text: localize('colors.blackPoint'),
            class: 'color-panel-row-label'
        });

        const blackPointSlider = new MyFancySliderInput({
            class: 'color-panel-row-slider',
            min: 0,
            max: 1,
            step: 0.01,
            value: 0
        });

        blackPointRow.append(blackPointLabel);
        blackPointRow.append(blackPointSlider);

        // white point

        const whitePointRow = new Container({
            class: 'color-panel-row'
        });

        const whitePointLabel = new Label({
            text: localize('colors.whitePoint'),
            class: 'color-panel-row-label'
        });

        const whitePointSlider = new MyFancySliderInput({
            class: 'color-panel-row-slider',
            min: 0,
            max: 1,
            step: 0.01,
            value: 1
        });

        whitePointRow.append(whitePointLabel);
        whitePointRow.append(whitePointSlider);

        // transparency

        const transparencyRow = new Container({
            class: 'color-panel-row'
        });

        const transparencyLabel = new Label({
            text: localize('colors.transparency'),
            class: 'color-panel-row-label'
        });

        const transparencySlider = new MyFancySliderInput({
            class: 'color-panel-row-slider',
            min: -6,
            max: 6,
            step: 0.01,
            value: 1
        });

        transparencyRow.append(transparencyLabel);
        transparencyRow.append(transparencySlider);

        // control row

        const controlRow = new Container({
            class: 'color-panel-control-row'
        });

        const reset = new Label({
            class: 'panel-header-button',
            text: '\uE304'
        });

        controlRow.append(new Label({ class: 'panel-header-spacer' }));
        controlRow.append(reset);
        controlRow.append(new Label({ class: 'panel-header-spacer' }));

        this.append(header);
        this.append(tintRow);
        this.append(temperatureRow);
        this.append(brightnessRow);
        this.append(blackPointRow);
        this.append(whitePointRow);
        this.append(transparencyRow);
        this.append(new Label({ class: 'panel-header-spacer' }));
        this.append(controlRow);

        // handle ui updates

        let suppress = false;
        let selected: Splat = null;
        let op: SetSplatColorAdjustmentOp = null;

        const updateUIFromState = (splat: Splat) => {
            if (suppress) return;
            suppress = true;
            tintPicker.value = splat ? [splat.tintClr.r, splat.tintClr.g, splat.tintClr.b] : [1, 1, 1];
            temperatureSlider.value = splat ? splat.temperature : 0;
            brightnessSlider.value = splat ? splat.brightness : 0;
            blackPointSlider.value = splat ? splat.blackPoint : 0;
            whitePointSlider.value = splat ? splat.whitePoint : 1;
            transparencySlider.value = splat ? Math.log(splat.transparency) : 0;
            suppress = false;
        };

        const start = () => {
            if (selected) {
                op = new SetSplatColorAdjustmentOp({
                    splat: selected,
                    newState: {
                        tintClr: selected.tintClr.clone(),
                        temperature: selected.temperature,
                        brightness: selected.brightness,
                        blackPoint: selected.blackPoint,
                        whitePoint: selected.whitePoint,
                        transparency: selected.transparency
                    },
                    oldState: {
                        tintClr: selected.tintClr.clone(),
                        temperature: selected.temperature,
                        brightness: selected.brightness,
                        blackPoint: selected.blackPoint,
                        whitePoint: selected.whitePoint,
                        transparency: selected.transparency
                    }
                });
            }
        };

        const end = () => {
            if (op) {
                const { newState } = op;
                newState.tintClr.set(tintPicker.value[0], tintPicker.value[1], tintPicker.value[2]);
                newState.temperature = temperatureSlider.value;
                newState.brightness = brightnessSlider.value;
                newState.blackPoint = blackPointSlider.value;
                newState.whitePoint = whitePointSlider.value;
                newState.transparency = Math.exp(transparencySlider.value);
                events.fire('edit.add', op);
                op = null;
            }
        };

        const updateOp = (setFunc: (op: SetSplatColorAdjustmentOp) => void) => {
            if (!suppress) {
                suppress = true;
                if (op) {
                    setFunc(op);
                    op.do();
                } else if (selected) {
                    start();
                    setFunc(op);
                    op.do();
                    end();
                }
                suppress = false;
            }
        };

        [temperatureSlider, brightnessSlider, blackPointSlider, whitePointSlider, transparencySlider].forEach((slider) => {
            slider.on('slide:start', start);
            slider.on('slide:end', end);
        });
        tintPicker.on('picker:color:start', start);
        tintPicker.on('picker:color:end', end);

        tintPicker.on('change', (value: number[]) => {
            updateOp((op) => {
                op.newState.tintClr.set(value[0], value[1], value[2]);
            });
        });

        temperatureSlider.on('change', (value: number) => {
            updateOp((op) => {
                op.newState.temperature = value;
            });
        });

        brightnessSlider.on('change', (value: number) => {
            updateOp((op) => {
                op.newState.brightness = value;
            });
        });

        blackPointSlider.on('change', (value: number) => {
            updateOp((op) => {
                op.newState.blackPoint = value;
            });

            if (value > whitePointSlider.value) {
                whitePointSlider.value = value;
            }
        });

        whitePointSlider.on('change', (value: number) => {
            updateOp((op) => {
                op.newState.whitePoint = value;
            });

            if (value < blackPointSlider.value) {
                blackPointSlider.value = value;
            }
        });

        transparencySlider.on('change', (value: number) => {
            updateOp((op) => {
                op.newState.transparency = Math.exp(value);
            });
        });

        reset.on('click', () => {
            if (selected) {
                const op = new SetSplatColorAdjustmentOp({
                    splat: selected,
                    newState: {
                        tintClr: new Color(1, 1, 1),
                        temperature: 0,
                        brightness: 0,
                        blackPoint: 0,
                        whitePoint: 1,
                        transparency: 1
                    },
                    oldState: {
                        tintClr: selected.tintClr.clone(),
                        temperature: selected.temperature,
                        brightness: selected.brightness,
                        blackPoint: selected.blackPoint,
                        whitePoint: selected.whitePoint,
                        transparency: selected.transparency
                    }
                });

                events.fire('edit.add', op);
            }
        });

        events.on('selection.changed', (splat) => {
            selected = splat;
            updateUIFromState(splat);
        });

        events.on('splat.tintClr', updateUIFromState);
        events.on('splat.temperature', updateUIFromState);
        events.on('splat.brightness', updateUIFromState);
        events.on('splat.blackPoint', updateUIFromState);
        events.on('splat.whitePoint', updateUIFromState);
        events.on('splat.transparency', updateUIFromState);

        tooltips.register(reset, localize('colors.reset'), 'bottom');

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

        events.on('viewPanel.visible', (visible: boolean) => {
            if (visible) {
                setVisible(false);
            }
        });
    }
}

export { ColorPanel };
