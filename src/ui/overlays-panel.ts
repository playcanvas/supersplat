import { BooleanInput, Button, Container, Label } from '@playcanvas/pcui';

import { Events } from '../events';
import type { GridPlane } from '../infinite-grid';
import { ShortcutManager } from '../shortcut-manager';
import { i18n } from './localization';
import overlaysSvg from './svg/overlays.svg';
import resetSvg from './svg/reset.svg';
import { Tooltips } from './tooltips';

const createSvg = (svgString: string) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

// viewport state: overlays, helpers and diagnostics the user flips while
// working, as opposed to the preferences that live in the settings panel
class OverlaysPanel extends Container {
    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'overlays-panel',
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
        icon.dom.appendChild(createSvg(overlaysSvg));

        const label = new Label({
            class: 'panel-header-label'
        });
        i18n.bindText(label, 'panel.overlays');

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
        i18n.bindText(showGridLabel, 'panel.overlays.grid');

        const showGridToggle = new BooleanInput({
            type: 'toggle',
            class: 'settings-panel-row-toggle',
            value: true
        });

        showGridRow.append(showGridLabel);
        showGridRow.append(showGridToggle);

        // grid planes: one toggle per plane, any combination

        const gridPlanesRow = new Container({
            class: ['settings-panel-row', 'options-panel-icon-row', 'options-panel-row-indent']
        });

        const gridPlanesLabel = new Label({
            class: 'settings-panel-row-label'
        });
        i18n.bindText(gridPlanesLabel, 'panel.overlays.grid-planes');

        const planeButton = (plane: GridPlane) => {
            const button = new Button({
                class: 'options-panel-icon-button',
                text: plane.toUpperCase()
            });
            const label = () => `${i18n.t('panel.overlays.grid-planes')}: ${plane.toUpperCase()}`;
            i18n.onChange(() => button.dom.setAttribute('aria-label', label()), button);
            tooltips.register(button, label, 'top');
            button.on('click', () => events.fire('grid.togglePlane', plane));
            return button;
        };

        const planeButtons: [GridPlane, Button][] = [
            ['xz', planeButton('xz')],
            ['xy', planeButton('xy')],
            ['yz', planeButton('yz')]
        ];

        const gridPlanesToggles = new Container({
            class: 'options-panel-toggle-grid'
        });
        planeButtons.forEach(([, button]) => gridPlanesToggles.append(button));
        gridPlanesToggles.append(new Container({ class: 'options-panel-icon-spacer' }));

        gridPlanesRow.append(gridPlanesLabel);
        gridPlanesRow.append(gridPlanesToggles);

        const syncPlanes = (planes: GridPlane[]) => {
            planeButtons.forEach(([plane, button]) => {
                const active = planes.includes(plane);
                button.class[active ? 'add' : 'remove']('active');
                button.dom.setAttribute('aria-pressed', String(active));
            });
        };

        // show bound

        const showBoundRow = new Container({
            class: 'settings-panel-row'
        });

        const showBoundLabel = new Label({
            class: 'settings-panel-row-label'
        });
        i18n.bindText(showBoundLabel, 'panel.overlays.bounding-box');

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
        i18n.bindText(showBoundDimensionsLabel, 'panel.overlays.dimensions');

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
        i18n.bindText(showCameraPosesLabel, 'panel.overlays.camera-poses');

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
        i18n.bindText(showCameraInfoLabel, 'panel.overlays.camera-info');

        const showCameraInfoToggle = new BooleanInput({
            type: 'toggle',
            class: 'settings-panel-row-toggle',
            value: false
        });

        showCameraInfoRow.append(showCameraInfoLabel);
        showCameraInfoRow.append(showCameraInfoToggle);

        // frame timings overlay

        const perfOverlayRow = new Container({
            class: 'settings-panel-row'
        });

        const perfOverlayLabel = new Label({
            class: 'settings-panel-row-label'
        });
        i18n.bindText(perfOverlayLabel, 'panel.overlays.frame-timings');

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
        rowToggles(perfOverlayRow, perfOverlayToggle);

        this.append(header);
        this.append(sectionHeader('panel.overlays.section-helpers'));
        this.append(showGridRow);
        this.append(gridPlanesRow);
        this.append(showBoundRow);
        this.append(showBoundDimensionsRow);
        this.append(showCameraPosesRow);
        this.append(showCameraInfoRow);
        this.append(sectionHeader('panel.overlays.section-diagnostics'));
        this.append(perfOverlayRow);

        // the panel is constructed before the editor registers its state, and
        // the notify events only fire on change - so a value initialized from
        // config or url never reaches the constructor defaults above. Pull the
        // live state whenever the panel opens instead; assigning an unchanged
        // value is a no-op, and a changed one round-trips through the setter
        // idempotently.
        const sync = () => {
            const grid = events.invoke('grid.visible') as boolean;
            showGridToggle.value = grid;
            gridPlanesRow.enabled = grid;
            syncPlanes(events.invoke('grid.planes'));
            const bound = events.invoke('camera.bound') as boolean;
            showBoundToggle.value = bound;
            showBoundDimensionsRow.enabled = bound;
            showBoundDimensionsToggle.value = events.invoke('camera.boundDimensions');
            showCameraPosesToggle.value = events.invoke('camera.showPoses');
            showCameraInfoToggle.value = events.invoke('camera.showInfo');
            perfOverlayToggle.value = events.invoke('view.perfOverlay');
        };

        // handle panel visibility

        const setVisible = (visible: boolean) => {
            if (visible === this.hidden) {
                if (visible) {
                    sync();
                }
                this.hidden = !visible;
                events.fire('overlaysPanel.visible', visible);
            }
        };

        events.function('overlaysPanel.visible', () => {
            return !this.hidden;
        });

        events.on('overlaysPanel.setVisible', (visible: boolean) => {
            setVisible(visible);
        });

        events.on('overlaysPanel.toggleVisible', () => {
            setVisible(this.hidden);
        });

        events.on('settingsPanel.visible', (visible: boolean) => {
            if (visible) {
                setVisible(false);
            }
        });

        events.on('appearancePanel.visible', (visible: boolean) => {
            if (visible) {
                setVisible(false);
            }
        });

        resetButton.on('click', () => {
            events.fire('preferences.reset', 'overlays');
        });

        // show grid

        events.on('grid.visible', (visible: boolean) => {
            showGridToggle.value = visible;
            gridPlanesRow.enabled = visible;
        });

        showGridToggle.on('change', () => {
            events.fire('grid.setVisible', showGridToggle.value);
        });

        // grid planes

        events.on('grid.planes', syncPlanes);

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
        tooltips.register(showGridLabel, () => i18n.formatTooltipWithShortcut(i18n.t('panel.overlays.grid'), shortcut), 'left');
        const cameraInfoShortcut = shortcutManager.formatShortcut('camera.toggleShowInfo');
        tooltips.register(showCameraInfoLabel, () => i18n.formatTooltipWithShortcut(i18n.t('panel.overlays.camera-info'), cameraInfoShortcut), 'left');
        tooltips.register(resetButton, () => i18n.t('panel.settings.reset'), 'left');
    }
}

export { OverlaysPanel };
