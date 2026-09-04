import { Button, ColorPicker, Container, Label, SliderInput } from '@playcanvas/pcui';
import { Color } from 'playcanvas';

import { Events } from '../events';
import { ShortcutManager } from '../shortcut-manager';
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

class AppearancePanel extends Container {
    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'appearance-panel',
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
        i18n.bindText(label, 'panel.appearance');

        const resetButton = new Container({
            class: ['panel-header-button', 'panel-header-reset-button']
        });
        resetButton.dom.appendChild(createSvg(resetSvg));
        resetButton.dom.setAttribute('role', 'button');
        resetButton.dom.setAttribute('tabindex', '0');
        i18n.onChange(() => resetButton.dom.setAttribute('aria-label', i18n.t('panel.settings.reset')), resetButton);
        resetButton.dom.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                resetButton.dom.click();
            }
        });

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

        // tooltip resolvers: plain help text, or help text naming the edit
        // view shortcut (tab) that hides the display overlays
        const shortcutManager: ShortcutManager = events.invoke('shortcutManager');
        const help = (localeKey: string) => () => i18n.t(localeKey);
        const helpWithShortcut = (localeKey: string) => () => i18n.t(localeKey, {
            shortcut: shortcutManager.formatShortcut('view.toggleEditView')
        });

        const iconButton = (svg: string, localeKey: string, tooltip: () => string) => {
            const button = new Button({
                class: 'options-panel-icon-button'
            });
            button.dom.appendChild(createSvg(svg));
            i18n.onChange(() => button.dom.setAttribute('aria-label', i18n.t(localeKey)), button);
            tooltips.register(button, tooltip, 'top');
            return button;
        };

        const setActive = (button: Button, active: boolean) => {
            button.class[active ? 'add' : 'remove']('active');
            button.dom.setAttribute('aria-pressed', String(active));
        };

        // a 0-1 blend weight slider bound to a view.<name> value
        const blendSlider = (labelKey: string, name: string, tooltipKey: string) => {
            const row = new Container({
                class: 'settings-panel-row'
            });
            const rowLabel = new Label({
                class: 'settings-panel-row-label'
            });
            i18n.bindText(rowLabel, labelKey);
            tooltips.register(rowLabel, help(tooltipKey), 'top');
            const slider = new SliderInput({
                class: 'settings-panel-row-slider',
                min: 0,
                max: 1,
                precision: 2,
                value: 1
            });
            row.append(rowLabel);
            row.append(slider);
            events.on(`view.${name}`, (value: number) => {
                slider.value = value;
            });
            slider.on('change', (value: number) => {
                events.fire(`view.set${name[0].toUpperCase()}${name.slice(1)}`, value);
            });
            return { row, slider, name };
        };

        // display

        const displayRow = new Container({
            class: ['settings-panel-row', 'options-panel-icon-row']
        });

        const displayLabel = new Label({
            class: 'settings-panel-row-label'
        });
        i18n.bindText(displayLabel, 'panel.appearance.section-display');
        tooltips.register(displayLabel, helpWithShortcut('panel.appearance.section-display.tooltip'), 'top');

        const gaussiansButton = iconButton(colorsSvg, 'panel.appearance.gaussians', helpWithShortcut('panel.appearance.gaussians.tooltip'));
        const centersButton = iconButton(centersSvg, 'panel.appearance.centers', helpWithShortcut('panel.appearance.centers.tooltip'));
        const ringsButton = iconButton(ringsSvg, 'panel.appearance.rings', helpWithShortcut('panel.appearance.rings.tooltip'));

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
        i18n.bindText(centersSizeLabel, 'panel.appearance.size');
        tooltips.register(centersSizeLabel, help('panel.appearance.size.tooltip'), 'top');

        const centersSizeSlider = new SliderInput({
            class: 'settings-panel-row-slider',
            min: 0,
            max: 10,
            precision: 1,
            value: 2
        });

        centersSizeRow.append(centersSizeLabel);
        centersSizeRow.append(centersSizeSlider);

        const centersColorBlend = blendSlider('panel.appearance.unselected-blend', 'centersColorBlend', 'panel.appearance.centers-unselected-blend.tooltip');
        const centersSelectionBlend = blendSlider('panel.appearance.selection-blend', 'centersSelectionBlend', 'panel.appearance.centers-selection-blend.tooltip');

        // rings

        const ringSizeRow = new Container({
            class: 'settings-panel-row'
        });

        const ringSizeLabel = new Label({
            class: 'settings-panel-row-label'
        });
        i18n.bindText(ringSizeLabel, 'panel.appearance.thickness');
        tooltips.register(ringSizeLabel, help('panel.appearance.thickness.tooltip'), 'top');

        const ringSizeSlider = new SliderInput({
            class: 'settings-panel-row-slider',
            min: 1,
            max: 50,
            precision: 1,
            value: 4
        });

        ringSizeRow.append(ringSizeLabel);
        ringSizeRow.append(ringSizeSlider);

        const ringsColorBlend = blendSlider('panel.appearance.unselected-blend', 'ringsColorBlend', 'panel.appearance.rings-unselected-blend.tooltip');
        const ringsSelectionBlend = blendSlider('panel.appearance.selection-blend', 'ringsSelectionBlend', 'panel.appearance.rings-selection-blend.tooltip');

        // gaussians

        const splatsColorBlend = blendSlider('panel.appearance.unselected-blend', 'splatsColorBlend', 'panel.appearance.gaussians-unselected-blend.tooltip');
        const splatsSelectionBlend = blendSlider('panel.appearance.selection-blend', 'splatsSelectionBlend', 'panel.appearance.gaussians-selection-blend.tooltip');

        // selection display

        const selectionDisplayRow = new Container({
            class: ['settings-panel-row', 'options-panel-icon-row']
        });

        const selectionDisplayLabel = new Label({
            class: 'settings-panel-row-label'
        });
        i18n.bindText(selectionDisplayLabel, 'panel.appearance.section-selection');
        tooltips.register(selectionDisplayLabel, help('panel.appearance.section-selection.tooltip'), 'top');

        const selectionColorButton = iconButton(colorsSvg, 'panel.appearance.selection-color', help('panel.appearance.selection-color.tooltip'));
        const selectionCentersButton = iconButton(centersSvg, 'panel.appearance.selection-centers', help('panel.appearance.selection-centers.tooltip'));
        const selectionRingsButton = iconButton(ringsSvg, 'panel.appearance.selection-rings', help('panel.appearance.selection-rings.tooltip'));
        const outlineSelectionButton = iconButton(selectAllSvg, 'panel.appearance.selection-outline', help('panel.appearance.selection-outline.tooltip'));

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

        this.append(header);
        this.append(displayRow);
        this.append(selectionDisplayRow);
        this.append(colorsRow);
        this.append(sectionHeader('panel.appearance.gaussians'));
        this.append(splatsColorBlend.row);
        this.append(splatsSelectionBlend.row);
        this.append(sectionHeader('panel.appearance.centers'));
        this.append(centersSizeRow);
        this.append(centersColorBlend.row);
        this.append(centersSelectionBlend.row);
        this.append(sectionHeader('panel.appearance.rings'));
        this.append(ringSizeRow);
        this.append(ringsColorBlend.row);
        this.append(ringsSelectionBlend.row);

        const updateDisplay = () => {
            setActive(gaussiansButton, events.invoke('view.gaussians'));
            setActive(centersButton, events.invoke('view.centers'));
            setActive(ringsButton, events.invoke('view.rings'));

            // the edit view switch (tab) hides centers and rings without
            // touching their settings: dim the toggles so the stored state
            // stays readable while they have no effect
            const overridden = !events.invoke('view.editView');
            centersButton.class[overridden ? 'add' : 'remove']('overridden');
            ringsButton.class[overridden ? 'add' : 'remove']('overridden');
        };

        const updateSelectionDisplay = () => {
            setActive(selectionColorButton, events.invoke('view.selectionColor'));
            setActive(selectionCentersButton, events.invoke('view.selectionCenters'));
            setActive(selectionRingsButton, events.invoke('view.selectionRings'));
            setActive(outlineSelectionButton, events.invoke('view.outlineSelection'));
        };

        const sync = () => {
            updateDisplay();
            centersSizeSlider.value = events.invoke('view.centerSize');
            ringSizeSlider.value = events.invoke('view.ringSize');
            [
                splatsColorBlend, splatsSelectionBlend,
                centersColorBlend, centersSelectionBlend,
                ringsColorBlend, ringsSelectionBlend
            ].forEach(({ slider, name }) => {
                slider.value = events.invoke(`view.${name}`);
            });
            updateSelectionDisplay();
        };

        const setVisible = (visible: boolean) => {
            if (visible === this.hidden) {
                if (visible) {
                    sync();
                }
                this.hidden = !visible;
                events.fire('appearancePanel.visible', visible);
            }
        };

        events.function('appearancePanel.visible', () => !this.hidden);

        events.on('appearancePanel.setVisible', setVisible);

        events.on('appearancePanel.toggleVisible', () => {
            setVisible(this.hidden);
        });

        events.on('overlaysPanel.visible', (visible: boolean) => {
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
        events.on('view.editView', updateDisplay);

        gaussiansButton.on('click', () => {
            events.fire('view.setGaussians', !events.invoke('view.gaussians'));
        });

        centersButton.on('click', () => {
            events.fire('view.setCenters', !events.invoke('view.centers'));
        });

        ringsButton.on('click', () => {
            events.fire('view.setRings', !events.invoke('view.rings'));
        });

        events.on('view.centerSize', (value: number) => {
            centersSizeSlider.value = value;
        });

        centersSizeSlider.on('change', (value: number) => {
            events.fire('view.setCenterSize', value);
        });

        events.on('view.ringSize', (value: number) => {
            ringSizeSlider.value = value;
        });

        ringSizeSlider.on('change', (value: number) => {
            events.fire('view.setRingSize', value);
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

export { AppearancePanel };
