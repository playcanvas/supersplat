import { BooleanInput, Button, Container, Label, SliderInput } from '@playcanvas/pcui';

import { Events } from '../events';
import { i18n } from './localization';
import centersSvg from './svg/centers.svg';
import colorsSvg from './svg/colors.svg';
import ringsSvg from './svg/rings.svg';
import selectAllSvg from './svg/select-all.svg';
import showHideSplatsSvg from './svg/show-hide-splats.svg';
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
        icon.dom.appendChild(createSvg(showHideSplatsSvg));

        const label = new Label({
            class: 'panel-header-label'
        });
        i18n.bindText(label, 'panel.display');

        header.append(icon);
        header.append(label);

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

        displayRow.append(displayLabel);
        displayRow.append(gaussiansButton);
        displayRow.append(centersButton);
        displayRow.append(ringsButton);
        displayRow.append(new Container({ class: 'options-panel-icon-spacer' }));

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

        selectionDisplayRow.append(selectionDisplayLabel);
        selectionDisplayRow.append(selectionColorButton);
        selectionDisplayRow.append(selectionCentersButton);
        selectionDisplayRow.append(selectionRingsButton);
        selectionDisplayRow.append(outlineSelectionButton);

        rowToggles(centersColorRow, centersColorToggle);
        rowToggles(ringsColorRow, ringsColorToggle);

        this.append(header);
        this.append(displayRow);
        this.append(selectionDisplayRow);
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

    }
}

export { DisplayOptionsPanel };
