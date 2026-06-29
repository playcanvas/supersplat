import { BooleanInput, ColorPicker, Container, Label, SelectInput, SliderInput } from '@playcanvas/pcui';
import { Color } from 'playcanvas';

import { Events } from '../events';
import { ShortcutManager } from '../shortcut-manager';
import { i18n } from './localization';
import { Tooltips } from './tooltips';

class ViewPanel extends Container {
    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'view-panel',
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
            text: '\uE403',
            class: 'panel-header-icon'
        });

        const label = new Label({
            class: 'panel-header-label'
        });
        i18n.bindText(label, 'panel.view-options');

        header.append(icon);
        header.append(label);

        // language

        const languageRow = new Container({
            class: 'view-panel-row'
        });

        const languageLabel = new Label({
            class: 'view-panel-row-label'
        });
        i18n.bindText(languageLabel, 'panel.view-options.language');

        const languageSelection = new SelectInput({
            class: 'view-panel-row-select',
            // 'auto' unless the user has explicitly pinned a language
            defaultValue: i18n.storedLanguage ?? 'auto'
        });
        // 'auto' label follows the language; the per-language names are shown in
        // their native form so they're recognisable regardless of current UI lang
        i18n.bindOptions(languageSelection, () => [
            { v: 'auto', t: i18n.t('panel.view-options.language.auto') },
            ...i18n.languages.map(l => ({ v: l.code, t: l.name }))
        ]);

        // switch language live (no reload). a stored choice persists across
        // sessions; 'auto' clears it and reverts to the browser locale.
        languageSelection.on('change', (value: string) => {
            i18n.setLanguage(value === 'auto' ? null : value);
        });

        languageRow.append(languageLabel);
        languageRow.append(languageSelection);

        // colors

        const clrRow = new Container({
            class: 'view-panel-row'
        });

        const clrLabel = new Label({
            class: 'view-panel-row-label'
        });
        i18n.bindText(clrLabel, 'panel.view-options.colors');

        const clrPickers = new Container({
            class: 'view-panel-row-pickers'
        });

        const bgClrPicker = new ColorPicker({
            class: 'view-panel-row-picker',
            channels: 3,
            value: [0, 0, 0]
        });

        const selectedClrPicker = new ColorPicker({
            class: 'view-panel-row-picker',
            channels: 4,
            value: [0, 0, 0, 1]
        });

        const unselectedClrPicker = new ColorPicker({
            class: 'view-panel-row-picker',
            channels: 4,
            value: [0, 0, 0, 1]
        });

        const lockedClrPicker = new ColorPicker({
            class: 'view-panel-row-picker',
            channels: 4,
            value: [0, 0, 0, 1]
        });

        const toArray = (clr: Color) => {
            return [clr.r, clr.g, clr.b, clr.a];
        };

        events.on('bgClr', (clr: Color) => {
            bgClrPicker.value = toArray(clr);
        });

        events.on('selectedClr', (clr: Color) => {
            selectedClrPicker.value = toArray(clr);
        });

        events.on('unselectedClr', (clr: Color) => {
            unselectedClrPicker.value = toArray(clr);
        });

        events.on('lockedClr', (clr: Color) => {
            lockedClrPicker.value = toArray(clr);
        });

        clrPickers.append(bgClrPicker);
        clrPickers.append(selectedClrPicker);
        clrPickers.append(unselectedClrPicker);
        clrPickers.append(lockedClrPicker);

        clrRow.append(clrLabel);
        clrRow.append(clrPickers);

        // tonemapping

        const tonemappingRow = new Container({
            class: 'view-panel-row'
        });

        const tonemappingLabel = new Label({
            class: 'view-panel-row-label'
        });
        i18n.bindText(tonemappingLabel, 'panel.view-options.tonemapping');

        const tonemappingSelection = new SelectInput({
            class: 'view-panel-row-select',
            defaultValue: 'linear'
        });
        i18n.bindOptions(tonemappingSelection, () => [
            { v: 'linear', t: i18n.t('panel.view-options.tonemapping.linear') },
            { v: 'neutral', t: i18n.t('panel.view-options.tonemapping.neutral') },
            { v: 'aces', t: i18n.t('panel.view-options.tonemapping.aces') },
            { v: 'aces2', t: i18n.t('panel.view-options.tonemapping.aces2') },
            { v: 'filmic', t: i18n.t('panel.view-options.tonemapping.filmic') },
            { v: 'hejl', t: i18n.t('panel.view-options.tonemapping.hejl') }
        ]);

        tonemappingRow.append(tonemappingLabel);
        tonemappingRow.append(tonemappingSelection);

        // camera fov

        const fovRow = new Container({
            class: 'view-panel-row'
        });

        const fovLabel = new Label({
            class: 'view-panel-row-label'
        });
        i18n.bindText(fovLabel, 'panel.view-options.fov');

        const fovSlider = new SliderInput({
            class: 'view-panel-row-slider',
            min: 10,
            max: 120,
            precision: 1,
            value: 60
        });

        fovRow.append(fovLabel);
        fovRow.append(fovSlider);

        // sh bands
        const shBandsRow = new Container({
            class: 'view-panel-row'
        });

        const shBandsLabel = new Label({
            class: 'view-panel-row-label'
        });
        i18n.bindText(shBandsLabel, 'panel.view-options.sh-bands');

        const shBandsSlider = new SliderInput({
            class: 'view-panel-row-slider',
            min: 0,
            max: 3,
            precision: 0,
            value: 3
        });

        shBandsRow.append(shBandsLabel);
        shBandsRow.append(shBandsSlider);

        // camera fly speed

        const cameraFlySpeedRow = new Container({
            class: 'view-panel-row'
        });

        const cameraFlySpeedLabel = new Label({
            class: 'view-panel-row-label'
        });
        i18n.bindText(cameraFlySpeedLabel, 'panel.view-options.fly-speed');

        const cameraFlySpeedSlider = new SliderInput({
            class: 'view-panel-row-slider',
            min: 0.1,
            max: 30,
            precision: 1,
            value: 1
        });

        cameraFlySpeedRow.append(cameraFlySpeedLabel);
        cameraFlySpeedRow.append(cameraFlySpeedSlider);

        // centers size

        const centersSizeRow = new Container({
            class: 'view-panel-row'
        });

        const centersSizeLabel = new Label({
            class: 'view-panel-row-label'
        });
        i18n.bindText(centersSizeLabel, 'panel.view-options.centers-size');

        const centersSizeSlider = new SliderInput({
            class: 'view-panel-row-slider',
            min: 0,
            max: 10,
            precision: 1,
            value: 2
        });

        centersSizeRow.append(centersSizeLabel);
        centersSizeRow.append(centersSizeSlider);

        // centers gaussian color
        const centersColorRow = new Container({
            class: 'view-panel-row'
        });

        const centersColorLabel = new Label({
            class: 'view-panel-row-label'
        });
        i18n.bindText(centersColorLabel, 'panel.view-options.centers-gaussian-color');

        const centersColorToggle = new BooleanInput({
            type: 'toggle',
            class: 'view-panel-row-toggle',
            value: false
        });

        centersColorRow.append(centersColorLabel);
        centersColorRow.append(centersColorToggle);

        // outline selection

        const outlineSelectionRow = new Container({
            class: 'view-panel-row'
        });

        const outlineSelectionLabel = new Label({
            class: 'view-panel-row-label'
        });
        i18n.bindText(outlineSelectionLabel, 'panel.view-options.outline-selection');

        const outlineSelectionToggle = new BooleanInput({
            type: 'toggle',
            class: 'view-panel-row-toggle',
            value: false
        });

        outlineSelectionRow.append(outlineSelectionLabel);
        outlineSelectionRow.append(outlineSelectionToggle);

        // show grid

        const showGridRow = new Container({
            class: 'view-panel-row'
        });

        const showGridLabel = new Label({
            class: 'view-panel-row-label'
        });
        i18n.bindText(showGridLabel, 'panel.view-options.show-grid');

        const showGridToggle = new BooleanInput({
            type: 'toggle',
            class: 'view-panel-row-toggle',
            value: true
        });

        showGridRow.append(showGridLabel);
        showGridRow.append(showGridToggle);

        // show bound

        const showBoundRow = new Container({
            class: 'view-panel-row'
        });

        const showBoundLabel = new Label({
            class: 'view-panel-row-label'
        });
        i18n.bindText(showBoundLabel, 'panel.view-options.show-bound');

        const showBoundToggle = new BooleanInput({
            type: 'toggle',
            class: 'view-panel-row-toggle',
            value: true
        });

        showBoundRow.append(showBoundLabel);
        showBoundRow.append(showBoundToggle);

        // show dimensions

        const showBoundDimensionsRow = new Container({
            class: 'view-panel-row'
        });

        const showBoundDimensionsLabel = new Label({
            class: 'view-panel-row-label'
        });
        i18n.bindText(showBoundDimensionsLabel, 'panel.view-options.show-bound-dimensions');

        const showBoundDimensionsToggle = new BooleanInput({
            type: 'toggle',
            class: 'view-panel-row-toggle',
            value: false
        });

        showBoundDimensionsRow.append(showBoundDimensionsLabel);
        showBoundDimensionsRow.append(showBoundDimensionsToggle);

        // show camera poses

        const showCameraPosesRow = new Container({
            class: 'view-panel-row'
        });

        const showCameraPosesLabel = new Label({
            class: 'view-panel-row-label'
        });
        i18n.bindText(showCameraPosesLabel, 'panel.view-options.show-camera-poses');

        const showCameraPosesToggle = new BooleanInput({
            type: 'toggle',
            class: 'view-panel-row-toggle',
            value: false
        });

        showCameraPosesRow.append(showCameraPosesLabel);
        showCameraPosesRow.append(showCameraPosesToggle);

        this.append(header);
        this.append(languageRow);
        this.append(clrRow);
        this.append(tonemappingRow);
        this.append(fovRow);
        this.append(shBandsRow);
        this.append(cameraFlySpeedRow);
        this.append(centersSizeRow);
        this.append(centersColorRow);
        this.append(outlineSelectionRow);
        this.append(showGridRow);
        this.append(showBoundRow);
        this.append(showBoundDimensionsRow);
        this.append(showCameraPosesRow);

        // handle panel visibility

        const setVisible = (visible: boolean) => {
            if (visible === this.hidden) {
                this.hidden = !visible;
                events.fire('viewPanel.visible', visible);
            }
        };

        events.function('viewPanel.visible', () => {
            return !this.hidden;
        });

        events.on('viewPanel.setVisible', (visible: boolean) => {
            setVisible(visible);
        });

        events.on('viewPanel.toggleVisible', () => {
            setVisible(this.hidden);
        });

        events.on('colorPanel.visible', (visible: boolean) => {
            if (visible) {
                setVisible(false);
            }
        });

        // sh bands

        events.on('view.bands', (bands: number) => {
            shBandsSlider.value = bands;
        });

        shBandsSlider.on('change', (value: number) => {
            events.fire('view.setBands', value);
        });

        // splat size

        events.on('camera.splatSize', (value: number) => {
            centersSizeSlider.value = value;
        });

        centersSizeSlider.on('change', (value: number) => {
            events.fire('camera.setSplatSize', value);
            events.fire('camera.setOverlay', true);
            events.fire('camera.setMode', 'centers');
        });

        // centers gaussian color
        events.on('view.centersUseGaussianColor', (value: boolean) => {
            centersColorToggle.value = value;
        });

        centersColorToggle.on('change', (value: boolean) => {
            events.fire('view.setCentersUseGaussianColor', value);
        });

        // camera speed

        events.on('camera.flySpeed', (value: number) => {
            cameraFlySpeedSlider.value = value;
        });

        cameraFlySpeedSlider.on('change', (value: number) => {
            events.fire('camera.setFlySpeed', value);
        });

        // outline selection

        events.on('view.outlineSelection', (value: boolean) => {
            outlineSelectionToggle.value = value;
        });

        outlineSelectionToggle.on('change', (value: boolean) => {
            events.fire('view.setOutlineSelection', value);
        });

        // show grid

        events.on('grid.visible', (visible: boolean) => {
            showGridToggle.value = visible;
        });

        showGridToggle.on('change', () => {
            events.fire('grid.setVisible', showGridToggle.value);
        });

        // show bound

        events.on('camera.bound', (visible: boolean) => {
            showBoundToggle.value = visible;
        });

        showBoundToggle.on('change', () => {
            events.fire('camera.setBound', showBoundToggle.value);
        });

        // show dimensions

        events.on('camera.boundDimensions', (visible: boolean) => {
            showBoundDimensionsToggle.value = visible;
        });

        showBoundDimensionsToggle.on('change', () => {
            events.fire('camera.setBoundDimensions', showBoundDimensionsToggle.value);
        });

        // show camera poses

        events.on('camera.showPoses', (visible: boolean) => {
            showCameraPosesToggle.value = visible;
        });

        showCameraPosesToggle.on('change', () => {
            events.fire('camera.setShowPoses', showCameraPosesToggle.value);
        });

        // background color

        bgClrPicker.on('change', (value: number[]) => {
            events.fire('setBgClr', new Color(value[0], value[1], value[2]));
        });

        selectedClrPicker.on('change', (value: number[]) => {
            events.fire('setSelectedClr', new Color(value[0], value[1], value[2], value[3]));
        });

        unselectedClrPicker.on('change', (value: number[]) => {
            events.fire('setUnselectedClr', new Color(value[0], value[1], value[2], value[3]));
        });

        lockedClrPicker.on('change', (value: number[]) => {
            events.fire('setLockedClr', new Color(value[0], value[1], value[2], value[3]));
        });

        // camera fov

        events.on('camera.fov', (fov: number) => {
            fovSlider.value = fov;
        });

        fovSlider.on('change', (value: number) => {
            events.fire('camera.setFov', value);
        });

        // tonemapping

        events.on('camera.tonemapping', (tonemapping: string) => {
            tonemappingSelection.value = tonemapping;
        });

        tonemappingSelection.on('change', (value: string) => {
            events.fire('camera.setTonemapping', value);
        });

        // tooltips
        const shortcutManager: ShortcutManager = events.invoke('shortcutManager');
        const shortcut = shortcutManager.formatShortcut('grid.toggleVisible');
        tooltips.register(showGridLabel, () => i18n.formatTooltipWithShortcut(i18n.t('panel.view-options.show-grid'), shortcut), 'left');
        tooltips.register(bgClrPicker, () => i18n.t('panel.view-options.background-color'), 'left');
        tooltips.register(selectedClrPicker, () => i18n.t('panel.view-options.selected-color'), 'top');
        tooltips.register(unselectedClrPicker, () => i18n.t('panel.view-options.unselected-color'), 'top');
        tooltips.register(lockedClrPicker, () => i18n.t('panel.view-options.locked-color'), 'top');
    }
}

export { ViewPanel };
