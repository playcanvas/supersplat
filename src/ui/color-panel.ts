import { Button, ColorPicker, Container, SliderInput } from '@playcanvas/pcui';
import { Color } from 'playcanvas';

import type { Events } from '../events';
import type { Splat } from '../splat';

import type { ClipboardMenu, ClipboardSource } from './clipboard-menu';
import { colorField, numberField } from './clipboard-menu';
import { i18n } from './localization';
import { PanelSection } from './panel-section';
import checkSvg from './svg/check.svg';
import colorsSvg from './svg/colors.svg';
import editUndoSvg from './svg/edit-undo.svg';

// collapsible colors section of the scene panel: grades the current splat, so
// it lives with the rest of the current-splat state (like transform)
class ColorPanel extends PanelSection {
    constructor(events: Events, clipboardMenu: ClipboardMenu) {
        super({
            id: 'color-panel',
            icon: colorsSvg,
            localeKey: 'panel.colors',
            collapsed: true
        });

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

        const temperatureSlider = new SliderInput({
            class: 'color-panel-row-slider',
            min: -0.5,
            max: 0.5,
            step: 0.005,
            value: 0
        });

        const saturationSlider = new SliderInput({
            class: 'color-panel-row-slider',
            min: 0,
            max: 2,
            step: 0.1,
            value: 1
        });

        const brightnessSlider = new SliderInput({
            class: 'color-panel-row-slider',
            min: -1,
            max: 1,
            step: 0.1,
            value: 0
        });

        const blackPointSlider = new SliderInput({
            class: 'color-panel-row-slider',
            min: 0,
            max: 1,
            step: 0.01,
            value: 0
        });

        const whitePointSlider = new SliderInput({
            class: 'color-panel-row-slider',
            min: 0,
            max: 1,
            step: 0.01,
            value: 1
        });

        const transparencySlider = new SliderInput({
            class: 'color-panel-row-slider',
            min: -6,
            max: 6,
            step: 0.01,
            // log space: 0 is a factor of 1, i.e. neutral
            value: 0
        });

        const rows = {
            tint: this.addRow('panel.colors.tint', tintSlot),
            temperature: this.addRow('panel.colors.temperature', temperatureSlider),
            saturation: this.addRow('panel.colors.saturation', saturationSlider),
            brightness: this.addRow('panel.colors.brightness', brightnessSlider),
            blackPoint: this.addRow('panel.colors.black-point', blackPointSlider),
            whitePoint: this.addRow('panel.colors.white-point', whitePointSlider),
            transparency: this.addRow('panel.colors.transparency', transparencySlider)
        };

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

        this.content.append(controlRow);
        // dark strip closing the panel bottom, as the scene panel had before
        // this section joined it. Sits after the content and collapses with it
        // (in css) so the collapsed state still ends cleanly at the header bar
        this.append(new Container({ class: 'color-panel-footer' }));

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

        [temperatureSlider, saturationSlider, brightnessSlider, transparencySlider].forEach((slider) => {
            slider.on('change', changed);
        });
        tintPicker.on('change', changed);

        // black and white point can't meet: the grade divides by their
        // difference, and the editor rejects a range that doesn't increase. The
        // point that moved wins and pushes the other one a slider step along; at
        // the end of the range, where the other can't move, it stops a step short
        const POINT_STEP = 0.01;

        const separatePoints = (points: { blackPoint: number, whitePoint: number }, moved: 'blackPoint' | 'whitePoint') => {
            const { blackPoint, whitePoint } = points;
            if (blackPoint < whitePoint) {
                return { blackPoint, whitePoint };
            }
            if (moved === 'blackPoint') {
                return blackPoint + POINT_STEP <= 1 ?
                    { blackPoint, whitePoint: blackPoint + POINT_STEP } :
                    { blackPoint: 1 - POINT_STEP, whitePoint: 1 };
            }
            return whitePoint - POINT_STEP >= 0 ?
                { blackPoint: whitePoint - POINT_STEP, whitePoint } :
                { blackPoint: 0, whitePoint: POINT_STEP };
        };

        // the sliders round to their step and only fire on a real change, so
        // the nested change this triggers settles at once
        const keepPointsApart = (moved: 'blackPoint' | 'whitePoint') => {
            const points = separatePoints({ blackPoint: blackPointSlider.value, whitePoint: whitePointSlider.value }, moved);
            blackPointSlider.value = points.blackPoint;
            whitePointSlider.value = points.whitePoint;
            changed();
        };

        blackPointSlider.on('change', () => keepPointsApart('blackPoint'));

        whitePointSlider.on('change', () => keepPointsApart('whitePoint'));

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

        // copy/paste the pending grade in control space (transparency as the
        // log-space slider value), so a paste reproduces what the panel showed
        const controlValues = (): typeof NEUTRAL => ({
            tint: tintPicker.value,
            temperature: temperatureSlider.value,
            saturation: saturationSlider.value,
            brightness: brightnessSlider.value,
            blackPoint: blackPointSlider.value,
            whitePoint: whitePointSlider.value,
            transparency: transparencySlider.value
        });

        const sliderField = (slider: SliderInput) => numberField(() => slider.value, slider.min, slider.max);

        const clipboard: ClipboardSource = {
            fields: {
                tint: colorField(() => tintPicker.value),
                temperature: sliderField(temperatureSlider),
                saturation: sliderField(saturationSlider),
                brightness: sliderField(brightnessSlider),
                blackPoint: sliderField(blackPointSlider),
                whitePoint: sliderField(whitePointSlider),
                transparency: sliderField(transparencySlider)
            },
            apply: (values) => {
                const merged = { ...controlValues(), ...values } as typeof NEUTRAL;
                // resolve a crossing up front, as the sliders would: the pasted
                // point wins and pushes the other one along
                setControls({ ...merged, ...separatePoints(merged, 'whitePoint' in values ? 'whitePoint' : 'blackPoint') });
            },
            enabled: () => !!selected
        };

        clipboardMenu.register(this.header, clipboard);
        Object.entries(rows).forEach(([key, row]) => clipboardMenu.register(row, clipboard, key));

        events.on('selection.changed', (splat) => {
            selected = splat;
            // the pending grade belongs to the panel, not to a layer, but carrying it
            // across a selection change would silently retarget it
            setControls(NEUTRAL);
        });

    }
}

export { ColorPanel };
