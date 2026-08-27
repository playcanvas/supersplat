import { BooleanInput, Button, ColorPicker, Container, Label, SliderInput } from '@playcanvas/pcui';
import { Color } from 'playcanvas';

import { Events } from '../events';
import { i18n } from './localization';
import appearanceSvg from './svg/appearance.svg';
import centersSvg from './svg/centers.svg';
import colorsSvg from './svg/colors.svg';
import resetSvg from './svg/reset.svg';
import ringsSvg from './svg/rings.svg';
import selectAllSvg from './svg/select-all.svg';
import { Tooltips } from './tooltips';

const createSvg = (svgString: string) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

class DisplayOptionsPanel extends Container {
    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'display-options-panel',
            class: ['panel', 'options-panel'],
            hidden: true
        };

        super(args);

        ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick'].forEach((eventName) => {
            this.dom.addEventListener(eventName, (event: Event) => event.stopPropagation());
        });

        const header = new Container({
            class: 'panel-header'
        });

        const icon = new Label({
            class: 'panel-header-icon'
        });
        icon.dom.appendChild(createSvg(appearanceSvg));

        const label = new Label({
            class: 'panel-header-label'
        });
        i18n.bindText(label, 'panel.display');

        const resetButton = new Container({
            class: ['panel-header-button', 'panel-header-reset-button']
        });
        resetButton.dom.appendChild(createSvg(resetSvg));
        resetButton.dom.setAttribute('aria-label', i18n.t('panel.settings.reset'));

        header.append(icon);
        header.append(label);
        header.append(resetButton);

        const sectionHeader = (key: string) => {
            const section = new Container({
                class: ['panel-header', 'options-panel-section']
            });
            const sectionLabel = new Label({
                class: 'panel-header-label'
            });
            i18n.bindText(sectionLabel, key);
            section.append(sectionLabel);
            return section;
        };

        const rowToggles = (row: Container, toggle: BooleanInput) => {
            row.class.add('options-panel-row-clickable');
            row.dom.addEventListener('click', (event: MouseEvent) => {
                if (toggle.enabled && !toggle.dom.contains(event.target as Node)) {
                    toggle.value = !toggle.value;
                }
            });
        };

        const iconButton = (svg: string, localeKey: string) => {
            const button = new Button({
                class: 'options-panel-icon-button'
            });
            button.dom.appendChild(createSvg(svg));
            button.dom.setAttribute('aria-label', i18n.t(localeKey));
            tooltips.register(button, () => i18n.t(localeKey), 'top');
            return button;
        };

        const setActive = (button: Button, active: boolean) => {
            button.class[active ? 'add' : 'remove']('active');
            button.dom.setAttribute('aria-pressed', String(active));
        };

        // display

        const displayRow = new Container({
            class: ['settings-panel-row', 'options-panel-icon-row']
        });

        const displayLabel = new Label({
            class: 'settings-panel-row-label'
        });
        i18n.bindText(displayLabel, 'panel.display.section-display');

        const gaussiansButton = iconButton(colorsSvg, 'panel.display.gaussians');
        const centersButton = iconButton(centersSvg, 'panel.display.centers');
        const ringsButton = iconButton(ringsSvg, 'panel.display.rings');

        const displayToggles = new Container({
            class: 'options-panel-toggle-grid'
        });
        displayToggles.append(gaussiansButton);
        displayToggles.append(centersButton);
        displayToggles.append(ringsButton);
        displayToggles.append(new Container({ class: 'options-panel-icon-spacer' }));

        displayRow.append(displayLabel);
        displayRow.append(displayToggles);

        // centers

        const centersSizeRow = new Container({
            class: 'settings-panel-row'
        });

        const centersSizeLabel = new Label({
            class: 'settings-panel-row-label'
        });
        i18n.bindText(centersSizeLabel, 'panel.display.size');

        const centersSizeSlider = new SliderInput({
            class: 'settings-panel-row-slider',
            min: 0,
            max: 10,
            precision: 1,
            value: 2
        });

        centersSizeRow.append(centersSizeLabel);
        centersSizeRow.append(centersSizeSlider);

        const centersColorRow = new Container({
            class: 'settings-panel-row'
        });

        const centersColorLabel = new Label({
            class: 'settings-panel-row-label'
        });
        i18n.bindText(centersColorLabel, 'panel.display.use-gaussian-colors');

        const centersColorToggle = new BooleanInput({
            type: 'toggle',
            class: 'settings-panel-row-toggle',
            value: false
        });

        centersColorRow.append(centersColorLabel);
        centersColorRow.append(centersColorToggle);

        // rings

        const ringSizeRow = new Container({
            class: 'settings-panel-row'
        });

        const ringSizeLabel = new Label({
            class: 'settings-panel-row-label'
        });
        i18n.bindText(ringSizeLabel, 'panel.display.thickness');

        const ringSizeSlider = new SliderInput({
            class: 'settings-panel-row-slider',
            min: 1,
            max: 50,
            precision: 1,
            value: 4
        });

        ringSizeRow.append(ringSizeLabel);
        ringSizeRow.append(ringSizeSlider);

        const ringsColorRow = new Container({
            class: 'settings-panel-row'
        });

        const ringsColorLabel = new Label({
            class: 'settings-panel-row-label'
        });
        i18n.bindText(ringsColorLabel, 'panel.display.use-gaussian-colors');

        const ringsColorToggle = new BooleanInput({
            type: 'toggle',
            class: 'settings-panel-row-toggle',
            value: true
        });

        ringsColorRow.append(ringsColorLabel);
        ringsColorRow.append(ringsColorToggle);

        // selection display

        const selectionDisplayRow = new Container({
            class: ['settings-panel-row', 'options-panel-icon-row']
        });

        const selectionDisplayLabel = new Label({
            class: 'settings-panel-row-label'
        });
        i18n.bindText(selectionDisplayLabel, 'panel.display.section-selection');

        const selectionColorButton = iconButton(colorsSvg, 'panel.display.selection-color');
        const selectionCentersButton = iconButton(centersSvg, 'panel.display.selection-centers');
        const selectionRingsButton = iconButton(ringsSvg, 'panel.display.selection-rings');
        const outlineSelectionButton = iconButton(selectAllSvg, 'panel.display.selection-outline');

        const selectionToggles = new Container({
            class: 'options-panel-toggle-grid'
        });
        selectionToggles.append(selectionColorButton);
        selectionToggles.append(selectionCentersButton);
        selectionToggles.append(selectionRingsButton);
        selectionToggles.append(outlineSelectionButton);

        selectionDisplayRow.append(selectionDisplayLabel);
        selectionDisplayRow.append(selectionToggles);

        // viewport colors

        const colorsRow = new Container({
            class: 'settings-panel-row'
        });

        const colorsLabel = new Label({
            class: 'settings-panel-row-label'
        });
        i18n.bindText(colorsLabel, 'panel.settings.colors');

        const colorPickers = new Container({
            class: 'settings-panel-row-pickers'
        });

        const bgClrPicker = new ColorPicker({
            class: 'settings-panel-row-picker',
            channels: 3,
            value: [0, 0, 0]
        });

        const selectedClrPicker = new ColorPicker({
            class: 'settings-panel-row-picker',
            channels: 4,
            value: [0, 0, 0, 1]
        });

        const unselectedClrPicker = new ColorPicker({
            class: 'settings-panel-row-picker',
            channels: 4,
            value: [0, 0, 0, 1]
        });

        const lockedClrPicker = new ColorPicker({
            class: 'settings-panel-row-picker',
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

        colorPickers.append(bgClrPicker);
        colorPickers.append(selectedClrPicker);
        colorPickers.append(unselectedClrPicker);
        colorPickers.append(lockedClrPicker);

        colorsRow.append(colorsLabel);
        colorsRow.append(colorPickers);

        rowToggles(centersColorRow, centersColorToggle);
        rowToggles(ringsColorRow, ringsColorToggle);

        this.append(header);
        this.append(displayRow);
        this.append(selectionDisplayRow);
        this.append(colorsRow);
        this.append(sectionHeader('panel.display.centers'));
        this.append(centersSizeRow);
        this.append(centersColorRow);
        this.append(sectionHeader('panel.display.rings'));
        this.append(ringSizeRow);
        this.append(ringsColorRow);

        const updateDisplay = () => {
            setActive(gaussiansButton, events.invoke('view.gaussians'));
            setActive(centersButton, events.invoke('view.centers'));
            setActive(ringsButton, events.invoke('view.rings'));
        };

        const updateSelectionDisplay = () => {
            setActive(selectionColorButton, events.invoke('view.selectionColor'));
            setActive(selectionCentersButton, events.invoke('view.selectionCenters'));
            setActive(selectionRingsButton, events.invoke('view.selectionRings'));
            setActive(outlineSelectionButton, events.invoke('view.outlineSelection'));
        };

        const sync = () => {
            updateDisplay();
            centersSizeSlider.value = events.invoke('camera.splatSize');
            centersColorToggle.value = events.invoke('view.centersUseGaussianColor');
            ringSizeSlider.value = events.invoke('view.ringSize');
            ringsColorToggle.value = events.invoke('view.ringsUseGaussianColor');
            updateSelectionDisplay();
        };

        const setVisible = (visible: boolean) => {
            if (visible === this.hidden) {
                if (visible) {
                    sync();
                }
                this.hidden = !visible;
                events.fire('displayPanel.visible', visible);
            }
        };

        events.function('displayPanel.visible', () => !this.hidden);

        events.on('displayPanel.setVisible', setVisible);

        events.on('displayPanel.toggleVisible', () => {
            setVisible(this.hidden);
        });

        events.on('viewPanel.visible', (visible: boolean) => {
            if (visible) {
                setVisible(false);
            }
        });

        events.on('settingsPanel.visible', (visible: boolean) => {
            if (visible) {
                setVisible(false);
            }
        });

        resetButton.on('click', () => {
            events.fire('preferences.reset', 'appearance');
        });

        events.on('view.gaussians', updateDisplay);
        events.on('view.centers', updateDisplay);
        events.on('view.rings', updateDisplay);

        gaussiansButton.on('click', () => {
            events.fire('view.setGaussians', !events.invoke('view.gaussians'));
        });

        centersButton.on('click', () => {
            events.fire('view.setCenters', !events.invoke('view.centers'));
        });

        ringsButton.on('click', () => {
            events.fire('view.setRings', !events.invoke('view.rings'));
        });

        events.on('camera.splatSize', (value: number) => {
            centersSizeSlider.value = value;
        });

        centersSizeSlider.on('change', (value: number) => {
            events.fire('camera.setSplatSize', value);
        });

        events.on('view.centersUseGaussianColor', (value: boolean) => {
            centersColorToggle.value = value;
        });

        centersColorToggle.on('change', (value: boolean) => {
            events.fire('view.setCentersUseGaussianColor', value);
        });

        events.on('view.ringSize', (value: number) => {
            ringSizeSlider.value = value;
        });

        ringSizeSlider.on('change', (value: number) => {
            events.fire('view.setRingSize', value);
        });

        events.on('view.ringsUseGaussianColor', (value: boolean) => {
            ringsColorToggle.value = value;
        });

        ringsColorToggle.on('change', (value: boolean) => {
            events.fire('view.setRingsUseGaussianColor', value);
        });

        events.on('view.selectionColor', updateSelectionDisplay);
        events.on('view.selectionCenters', updateSelectionDisplay);
        events.on('view.selectionRings', updateSelectionDisplay);
        events.on('view.outlineSelection', updateSelectionDisplay);

        selectionColorButton.on('click', () => {
            events.fire('view.setSelectionColor', !events.invoke('view.selectionColor'));
        });

        selectionCentersButton.on('click', () => {
            events.fire('view.setSelectionCenters', !events.invoke('view.selectionCenters'));
        });

        selectionRingsButton.on('click', () => {
            events.fire('view.setSelectionRings', !events.invoke('view.selectionRings'));
        });

        outlineSelectionButton.on('click', () => {
            events.fire('view.setOutlineSelection', !events.invoke('view.outlineSelection'));
        });

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

        tooltips.register(bgClrPicker, () => i18n.t('panel.settings.background-color'), 'left');
        tooltips.register(selectedClrPicker, () => i18n.t('panel.settings.selected-color'), 'top');
        tooltips.register(unselectedClrPicker, () => i18n.t('panel.settings.unselected-color'), 'top');
        tooltips.register(lockedClrPicker, () => i18n.t('panel.settings.locked-color'), 'top');
        tooltips.register(resetButton, () => i18n.t('panel.settings.reset'), 'left');

    }
}

export { DisplayOptionsPanel };
