import { BooleanInput, Container, Label, SelectInput, SliderInput } from '@playcanvas/pcui';

import { Events } from '../events';
import type { GridPlane } from '../infinite-grid';
import { ShortcutManager } from '../shortcut-manager';
import { i18n } from './localization';
import shownSvg from './svg/shown.svg';
import { Tooltips } from './tooltips';

const createSvg = (svgString: string) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

// viewport state: overlays, helpers and diagnostics the user flips while
// working, as opposed to the preferences that live in the settings panel
class ViewOptionsPanel extends Container {
    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'view-options-panel',
            class: ['panel', 'options-panel'],
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

        // same eye artwork as the toolbar button
        const icon = new Label({
            class: 'panel-header-icon'
        });
        icon.dom.appendChild(createSvg(shownSvg));

        const label = new Label({
            class: 'panel-header-label'
        });
        i18n.bindText(label, 'panel.view');

        header.append(icon);
        header.append(label);

        // section bars share the panel-header styling, like the scene
        // manager's transform header
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

        // toggle rows flip on a click anywhere in the row, not just the switch
        const rowToggles = (row: Container, toggle: BooleanInput) => {
            row.class.add('options-panel-row-clickable');
            row.dom.addEventListener('click', (event: MouseEvent) => {
                if (toggle.enabled && !toggle.dom.contains(event.target as Node)) {
                    toggle.value = !toggle.value;
                }
            });
        };

        // show grid

        const showGridRow = new Container({
            class: 'settings-panel-row'
        });

        const showGridLabel = new Label({
            class: 'settings-panel-row-label'
        });
        i18n.bindText(showGridLabel, 'panel.view.grid');

        const showGridToggle = new BooleanInput({
            type: 'toggle',
            class: 'settings-panel-row-toggle',
            value: true
        });

        showGridRow.append(showGridLabel);
        showGridRow.append(showGridToggle);

        // grid plane

        const gridPlaneRow = new Container({
            class: ['settings-panel-row', 'options-panel-row-indent']
        });

        const gridPlaneLabel = new Label({
            class: 'settings-panel-row-label'
        });
        i18n.bindText(gridPlaneLabel, 'panel.view.grid-plane');

        const gridPlaneSelection = new SelectInput({
            class: 'settings-panel-row-select',
            defaultValue: 'xz',
            options: [
                { v: 'xz', t: 'XZ' },
                { v: 'xy', t: 'XY' },
                { v: 'yz', t: 'YZ' }
            ]
        });

        gridPlaneRow.append(gridPlaneLabel);
        gridPlaneRow.append(gridPlaneSelection);

        // show bound

        const showBoundRow = new Container({
            class: 'settings-panel-row'
        });

        const showBoundLabel = new Label({
            class: 'settings-panel-row-label'
        });
        i18n.bindText(showBoundLabel, 'panel.view.bounding-box');

        const showBoundToggle = new BooleanInput({
            type: 'toggle',
            class: 'settings-panel-row-toggle',
            value: true
        });

        showBoundRow.append(showBoundLabel);
        showBoundRow.append(showBoundToggle);

        // show dimensions

        const showBoundDimensionsRow = new Container({
            class: ['settings-panel-row', 'options-panel-row-indent']
        });

        const showBoundDimensionsLabel = new Label({
            class: 'settings-panel-row-label'
        });
        i18n.bindText(showBoundDimensionsLabel, 'panel.view.dimensions');

        const showBoundDimensionsToggle = new BooleanInput({
            type: 'toggle',
            class: 'settings-panel-row-toggle',
            value: false
        });

        showBoundDimensionsRow.append(showBoundDimensionsLabel);
        showBoundDimensionsRow.append(showBoundDimensionsToggle);

        // show camera poses

        const showCameraPosesRow = new Container({
            class: 'settings-panel-row'
        });

        const showCameraPosesLabel = new Label({
            class: 'settings-panel-row-label'
        });
        i18n.bindText(showCameraPosesLabel, 'panel.view.camera-poses');

        const showCameraPosesToggle = new BooleanInput({
            type: 'toggle',
            class: 'settings-panel-row-toggle',
            value: false
        });

        showCameraPosesRow.append(showCameraPosesLabel);
        showCameraPosesRow.append(showCameraPosesToggle);

        // show camera info

        const showCameraInfoRow = new Container({
            class: 'settings-panel-row'
        });

        const showCameraInfoLabel = new Label({
            class: 'settings-panel-row-label'
        });
        i18n.bindText(showCameraInfoLabel, 'panel.view.camera-info');

        const showCameraInfoToggle = new BooleanInput({
            type: 'toggle',
            class: 'settings-panel-row-toggle',
            value: false
        });

        showCameraInfoRow.append(showCameraInfoLabel);
        showCameraInfoRow.append(showCameraInfoToggle);

        // centers size

        const centersSizeRow = new Container({
            class: 'settings-panel-row'
        });

        const centersSizeLabel = new Label({
            class: 'settings-panel-row-label'
        });
        i18n.bindText(centersSizeLabel, 'panel.view.center-size');

        const centersSizeSlider = new SliderInput({
            class: 'settings-panel-row-slider',
            min: 0,
            max: 10,
            precision: 1,
            value: 2
        });

        centersSizeRow.append(centersSizeLabel);
        centersSizeRow.append(centersSizeSlider);

        // centers gaussian color

        const centersColorRow = new Container({
            class: 'settings-panel-row'
        });

        const centersColorLabel = new Label({
            class: 'settings-panel-row-label'
        });
        i18n.bindText(centersColorLabel, 'panel.view.use-splat-colors');

        const centersColorToggle = new BooleanInput({
            type: 'toggle',
            class: 'settings-panel-row-toggle',
            value: false
        });

        centersColorRow.append(centersColorLabel);
        centersColorRow.append(centersColorToggle);

        // outline selection

        const outlineSelectionRow = new Container({
            class: 'settings-panel-row'
        });

        const outlineSelectionLabel = new Label({
            class: 'settings-panel-row-label'
        });
        i18n.bindText(outlineSelectionLabel, 'panel.view.outline-selection');

        const outlineSelectionToggle = new BooleanInput({
            type: 'toggle',
            class: 'settings-panel-row-toggle',
            value: false
        });

        outlineSelectionRow.append(outlineSelectionLabel);
        outlineSelectionRow.append(outlineSelectionToggle);

        // frame timings overlay

        const perfOverlayRow = new Container({
            class: 'settings-panel-row'
        });

        const perfOverlayLabel = new Label({
            class: 'settings-panel-row-label'
        });
        i18n.bindText(perfOverlayLabel, 'panel.view.frame-timings');

        const perfOverlayToggle = new BooleanInput({
            type: 'toggle',
            class: 'settings-panel-row-toggle',
            value: false
        });

        perfOverlayRow.append(perfOverlayLabel);
        perfOverlayRow.append(perfOverlayToggle);

        rowToggles(showGridRow, showGridToggle);
        rowToggles(showBoundRow, showBoundToggle);
        rowToggles(showBoundDimensionsRow, showBoundDimensionsToggle);
        rowToggles(showCameraPosesRow, showCameraPosesToggle);
        rowToggles(showCameraInfoRow, showCameraInfoToggle);
        rowToggles(centersColorRow, centersColorToggle);
        rowToggles(outlineSelectionRow, outlineSelectionToggle);
        rowToggles(perfOverlayRow, perfOverlayToggle);

        this.append(header);
        this.append(sectionHeader('panel.view.section-show'));
        this.append(showGridRow);
        this.append(gridPlaneRow);
        this.append(showBoundRow);
        this.append(showBoundDimensionsRow);
        this.append(showCameraPosesRow);
        this.append(showCameraInfoRow);
        this.append(sectionHeader('panel.view.section-overlay'));
        this.append(centersSizeRow);
        this.append(centersColorRow);
        this.append(outlineSelectionRow);
        this.append(sectionHeader('panel.view.section-diagnostics'));
        this.append(perfOverlayRow);

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

        events.on('settingsPanel.visible', (visible: boolean) => {
            if (visible) {
                setVisible(false);
            }
        });

        // show grid

        events.on('grid.visible', (visible: boolean) => {
            showGridToggle.value = visible;
            gridPlaneRow.enabled = visible;
        });

        showGridToggle.on('change', () => {
            events.fire('grid.setVisible', showGridToggle.value);
        });

        // grid plane

        events.on('grid.plane', (plane: GridPlane) => {
            gridPlaneSelection.value = plane;
        });

        gridPlaneSelection.on('change', (value: GridPlane) => {
            events.fire('grid.setPlane', value);
        });

        // show bound

        events.on('camera.bound', (visible: boolean) => {
            showBoundToggle.value = visible;
            showBoundDimensionsRow.enabled = visible;
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

        // show camera info

        events.on('camera.showInfo', (visible: boolean) => {
            showCameraInfoToggle.value = visible;
        });

        showCameraInfoToggle.on('change', () => {
            events.fire('camera.setShowInfo', showCameraInfoToggle.value);
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

        // outline selection

        events.on('view.outlineSelection', (value: boolean) => {
            outlineSelectionToggle.value = value;
        });

        outlineSelectionToggle.on('change', (value: boolean) => {
            events.fire('view.setOutlineSelection', value);
        });

        // frame timings overlay

        events.on('view.perfOverlay', (value: boolean) => {
            perfOverlayToggle.value = value;
        });

        perfOverlayToggle.on('change', (value: boolean) => {
            events.fire('view.setPerfOverlay', value);
        });

        // tooltips
        const shortcutManager: ShortcutManager = events.invoke('shortcutManager');
        const shortcut = shortcutManager.formatShortcut('grid.toggleVisible');
        tooltips.register(showGridLabel, () => i18n.formatTooltipWithShortcut(i18n.t('panel.view.grid'), shortcut), 'left');
        const cameraInfoShortcut = shortcutManager.formatShortcut('camera.toggleShowInfo');
        tooltips.register(showCameraInfoLabel, () => i18n.formatTooltipWithShortcut(i18n.t('panel.view.camera-info'), cameraInfoShortcut), 'left');
    }
}

export { ViewOptionsPanel };
