import { ColorPicker, Container, Label, SliderInput } from '@playcanvas/pcui';
import { Color } from 'playcanvas';

import { Events } from '../events';
import { i18n } from './localization';
import { Tooltips } from './tooltips';
import { Splat } from '../splat';

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
            class: 'panel-header-label'
        });
        i18n.bindText(label, 'panel.colors');

        header.append(icon);
        header.append(label);

        // tint

        const tintRow = new Container({
            class: 'color-panel-row'
        });

        const tintLabel = new Label({
            class: 'color-panel-row-label'
        });
        i18n.bindText(tintLabel, 'panel.colors.tint');

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
            class: 'color-panel-row-label'
        });
        i18n.bindText(temperatureLabel, 'panel.colors.temperature');

        const temperatureSlider = new SliderInput({
            class: 'color-panel-row-slider',
            min: -0.5,
            max: 0.5,
            step: 0.005,
            value: 0
        });

        temperatureRow.append(temperatureLabel);
        temperatureRow.append(temperatureSlider);

        // saturation

        const saturationRow = new Container({
            class: 'color-panel-row'
        });

        const saturationLabel = new Label({
            class: 'color-panel-row-label'
        });
        i18n.bindText(saturationLabel, 'panel.colors.saturation');

        const saturationSlider = new SliderInput({
            class: 'color-panel-row-slider',
            min: 0,
            max: 2,
            step: 0.1,
            value: 1
        });

        saturationRow.append(saturationLabel);
        saturationRow.append(saturationSlider);

        // brightness

        const brightnessRow = new Container({
            class: 'color-panel-row'
        });

        const brightnessLabel = new Label({
            class: 'color-panel-row-label'
        });
        i18n.bindText(brightnessLabel, 'panel.colors.brightness');

        const brightnessSlider = new SliderInput({
            class: 'color-panel-row-slider',
            min: -1,
            max: 1,
            step: 0.1,
            value: 0
        });

        brightnessRow.append(brightnessLabel);
        brightnessRow.append(brightnessSlider);

        // black point

        const blackPointRow = new Container({
            class: 'color-panel-row'
        });

        const blackPointLabel = new Label({
            class: 'color-panel-row-label'
        });
        i18n.bindText(blackPointLabel, 'panel.colors.black-point');

        const blackPointSlider = new SliderInput({
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
            class: 'color-panel-row-label'
        });
        i18n.bindText(whitePointLabel, 'panel.colors.white-point');

        const whitePointSlider = new SliderInput({
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
            class: 'color-panel-row-label'
        });
        i18n.bindText(transparencyLabel, 'panel.colors.transparency');

        const transparencySlider = new SliderInput({
            class: 'color-panel-row-slider',
            min: -6,
            max: 6,
            step: 0.01,
            // log space: 0 is a factor of 1, i.e. neutral
            value: 0
        });

        transparencyRow.append(transparencyLabel);
        transparencyRow.append(transparencySlider);

        // control row

        const controlRow = new Container({
            class: 'color-panel-control-row'
        });

        // apply bakes the pending grade into the target gaussians; reset clears
        // whatever grade they already carry
        const apply = new Label({
            class: 'panel-header-button',
            text: '\uE301'
        });

        const reset = new Label({
            class: 'panel-header-button',
            text: '\uE304'
        });

        controlRow.append(new Label({ class: 'panel-header-spacer' }));
        controlRow.append(apply);
        controlRow.append(reset);
        controlRow.append(new Label({ class: 'panel-header-spacer' }));

        this.append(header);
        this.append(tintRow);
        this.append(temperatureRow);
        this.append(saturationRow);
        this.append(brightnessRow);
        this.append(blackPointRow);
        this.append(whitePointRow);
        this.append(transparencyRow);
        this.append(new Label({ class: 'panel-header-spacer' }));
        this.append(controlRow);

        // The controls hold a *pending* grade rather than editing anything directly.
        // The viewport previews it on whatever an Apply would affect - the selection,
        // or the whole layer when nothing is selected - and Apply bakes it into those
        // gaussians' palette entries and returns the controls to neutral.

        let suppress = false;
        let selected: Splat = null;

        const NEUTRAL = {
            tint: [1, 1, 1],
            temperature: 0,
            saturation: 1,
            brightness: 0,
            blackPoint: 0,
            whitePoint: 1,
            transparency: 0     // slider is log space, so 0 means a factor of 1
        };

        // the pending grade in the form gradeTerms expects
        const pendingParams = () => ({
            tintClr: new Color(tintPicker.value[0], tintPicker.value[1], tintPicker.value[2]),
            temperature: temperatureSlider.value,
            saturation: saturationSlider.value,
            brightness: brightnessSlider.value,
            blackPoint: blackPointSlider.value,
            whitePoint: whitePointSlider.value,
            transparency: Math.exp(transparencySlider.value)
        });

        const isNeutral = () => (
            tintPicker.value[0] === NEUTRAL.tint[0] &&
            tintPicker.value[1] === NEUTRAL.tint[1] &&
            tintPicker.value[2] === NEUTRAL.tint[2] &&
            temperatureSlider.value === NEUTRAL.temperature &&
            saturationSlider.value === NEUTRAL.saturation &&
            brightnessSlider.value === NEUTRAL.brightness &&
            blackPointSlider.value === NEUTRAL.blackPoint &&
            whitePointSlider.value === NEUTRAL.whitePoint &&
            transparencySlider.value === NEUTRAL.transparency
        );

        // the renderer asks for this every frame; null means nothing to preview
        events.function('colorPanel.pending', () => {
            return (selected && !isNeutral()) ? pendingParams() : null;
        });

        const setControls = (values: typeof NEUTRAL) => {
            suppress = true;
            tintPicker.value = values.tint;
            temperatureSlider.value = values.temperature;
            saturationSlider.value = values.saturation;
            brightnessSlider.value = values.brightness;
            blackPointSlider.value = values.blackPoint;
            whitePointSlider.value = values.whitePoint;
            transparencySlider.value = values.transparency;
            suppress = false;
            events.fire('colorPanel.pendingChanged');
        };

        const changed = () => {
            if (!suppress) {
                events.fire('colorPanel.pendingChanged');
            }
        };

        [temperatureSlider, saturationSlider, brightnessSlider, whitePointSlider, transparencySlider].forEach((slider) => {
            slider.on('change', changed);
        });
        tintPicker.on('change', changed);

        // black and white point can't cross
        blackPointSlider.on('change', (value: number) => {
            if (value > whitePointSlider.value) {
                whitePointSlider.value = value;
            }
            changed();
        });

        whitePointSlider.on('change', (value: number) => {
            if (value < blackPointSlider.value) {
                blackPointSlider.value = value;
            }
        });

        apply.on('click', () => {
            if (selected && !isNeutral()) {
                events.fire('edit.applyColor', pendingParams());
                setControls(NEUTRAL);
            }
        });

        reset.on('click', () => {
            if (selected) {
                events.fire('edit.resetColor');
                // otherwise a pending grade would immediately re-tint what was cleared
                setControls(NEUTRAL);
            }
        });

        events.on('selection.changed', (splat) => {
            selected = splat;
            // the pending grade belongs to the panel, not to a layer, but carrying it
            // across a selection change would silently retarget it
            setControls(NEUTRAL);
        });

        tooltips.register(apply, () => i18n.t('panel.colors.apply'), 'bottom');
        tooltips.register(reset, () => i18n.t('panel.colors.reset'), 'bottom');

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

        events.on('settingsPanel.visible', (visible: boolean) => {
            if (visible) {
                setVisible(false);
            }
        });
    }
}

export { ColorPanel };
