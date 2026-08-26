import { Button, ColorPicker, Container, Label, SliderInput } from '@playcanvas/pcui';
import { Color } from 'playcanvas';

import { Events } from '../events';
import { i18n } from './localization';
import { Splat } from '../splat';
import arrowSvg from './svg/arrow.svg';
import checkSvg from './svg/check.svg';
import colorsSvg from './svg/colors.svg';
import editUndoSvg from './svg/edit-undo.svg';

const createSvg = (svgString: string) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

// collapsible colors section of the scene panel: grades the current splat, so
// it lives with the rest of the current-splat state (like transform)
class ColorPanel extends Container {
    constructor(events: Events, args = {}) {
        args = {
            ...args,
            class: 'color-panel-section'
        };

        super(args);

        // header (click to expand/collapse)

        const header = new Container({
            class: ['panel-header', 'color-panel-header']
        });

        const icon = new Label({
            class: 'panel-header-icon'
        });
        icon.dom.appendChild(createSvg(colorsSvg));

        const label = new Label({
            class: 'panel-header-label'
        });
        i18n.bindText(label, 'panel.colors');

        const collapseArrow = new Label({
            class: 'color-panel-collapse'
        });
        collapseArrow.dom.appendChild(createSvg(arrowSvg));

        header.append(icon);
        header.append(label);
        header.append(collapseArrow);

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

        // the swatch occupies the same control column as the sliders below,
        // left-aligned with their numeric edit boxes
        const tintSlot = new Container({
            class: 'color-panel-row-swatch-slot'
        });
        tintSlot.append(tintPicker);

        tintRow.append(tintLabel);
        tintRow.append(tintSlot);

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
        // whatever grade they already carry. Icons render as css masks (a child
        // svg would be wiped by the buttons' text setter on language change)
        const apply = new Button({
            class: 'color-panel-button'
        });
        i18n.bindText(apply, 'panel.colors.apply');
        apply.dom.style.setProperty('--icon', `url("${checkSvg}")`);

        const reset = new Button({
            class: 'color-panel-button'
        });
        i18n.bindText(reset, 'panel.colors.reset');
        reset.dom.style.setProperty('--icon', `url("${editUndoSvg}")`);

        controlRow.append(apply);
        controlRow.append(reset);

        // the collapsible body, closed by default
        const content = new Container({
            class: 'color-panel-content',
            hidden: true
        });

        content.append(tintRow);
        content.append(temperatureRow);
        content.append(saturationRow);
        content.append(brightnessRow);
        content.append(blackPointRow);
        content.append(whitePointRow);
        content.append(transparencyRow);
        content.append(controlRow);
        // dark strip closing the panel bottom, as the scene panel had before
        // this section joined it. Lives in the collapsible content so the
        // collapsed state still ends cleanly at the section header bar
        content.append(new Container({ class: 'color-panel-footer' }));

        this.append(header);
        this.append(content);

        header.on('click', () => {
            content.hidden = !content.hidden;
            collapseArrow.class[content.hidden ? 'remove' : 'add']('expanded');
        });

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

    }
}

export { ColorPanel };
