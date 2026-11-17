import { Button, Container, Element } from '@playcanvas/pcui';

import type { Events } from '../events';
import type { ShortcutManager } from '../shortcut-manager';

import { i18n } from './localization';
import cameraFrameSelectionSvg from './svg/camera-frame-selection.svg';
import cameraResetSvg from './svg/camera-reset.svg';
import flyCameraSvg from './svg/fly-camera.svg';
import orbitCameraSvg from './svg/orbit-camera.svg';
import overlaysSvg from './svg/overlays.svg';
import { createSwitch } from './toolbar-switch';
import type { Tooltips } from './tooltips';

const createSvg = (svgString: string) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

class RightToolbar extends Container {
    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'right-toolbar',
            class: 'toolbar-vertical'
        };

        super(args);

        this.dom.addEventListener('pointerdown', (event) => {
            event.stopPropagation();
        });

        const overlays = new Button({
            id: 'right-toolbar-overlays',
            class: 'toolbar-panel'
        });

        // the camera mode: one two-option switch
        const cameraSwitch = createSwitch<'orbit' | 'fly'>(
            'vertical',
            [
                { id: 'right-toolbar-orbit-mode', value: 'orbit', svg: orbitCameraSvg },
                { id: 'right-toolbar-fly-mode', value: 'fly', svg: flyCameraSvg }
            ],
            (mode) => events.fire('camera.setControlMode', mode)
        );
        const [orbitMode, flyMode] = cameraSwitch.buttons;

        const cameraFrameSelection = new Button({
            id: 'right-toolbar-frame-selection',
            class: 'toolbar-button'
        });

        const cameraReset = new Button({
            id: 'right-toolbar-camera-origin',
            class: 'toolbar-button'
        });

        const settings = new Button({
            id: 'right-toolbar-settings',
            class: 'toolbar-panel',
            icon: 'E283'
        });

        overlays.dom.appendChild(createSvg(overlaysSvg));
        cameraFrameSelection.dom.appendChild(createSvg(cameraFrameSelectionSvg));
        cameraReset.dom.appendChild(createSvg(cameraResetSvg));

        // icon-only buttons: keep accessible names in sync with the language
        const buttonLabels: [Button, string][] = [
            [overlays, 'panel.overlays'],
            [orbitMode, 'tooltip.right-toolbar.orbit-camera'],
            [flyMode, 'tooltip.right-toolbar.fly-camera'],
            [cameraFrameSelection, 'tooltip.right-toolbar.frame-selection'],
            [cameraReset, 'tooltip.right-toolbar.reset-camera'],
            [settings, 'panel.settings']
        ];
        buttonLabels.forEach(([button, key]) => {
            i18n.onChange(() => button.dom.setAttribute('aria-label', i18n.t(key)), button);
        });

        this.append(overlays);
        this.append(new Element({ class: 'toolbar-separator' }));
        this.append(cameraSwitch.container);
        this.append(new Element({ class: 'toolbar-separator' }));
        this.append(cameraFrameSelection);
        this.append(cameraReset);
        this.append(new Element({ class: 'toolbar-separator' }));
        this.append(settings);

        // Helper to compose localized tooltip text with shortcut
        const shortcutManager: ShortcutManager = events.invoke('shortcutManager');
        const tooltip = (localeKey: string, shortcutId?: string) => () => {
            const text = i18n.t(localeKey);
            if (shortcutId) {
                const shortcut = shortcutManager.formatShortcut(shortcutId);
                if (shortcut) {
                    return i18n.formatTooltipWithShortcut(text, shortcut);
                }
            }
            return text;
        };

        tooltips.register(overlays, tooltip('panel.overlays'), 'left');
        tooltips.register(orbitMode, tooltip('tooltip.right-toolbar.orbit-camera', 'camera.toggleControlMode'), 'left');
        tooltips.register(flyMode, tooltip('tooltip.right-toolbar.fly-camera', 'camera.toggleControlMode'), 'left');
        tooltips.register(
            cameraFrameSelection,
            tooltip('tooltip.right-toolbar.frame-selection', 'camera.focus'),
            'left'
        );
        tooltips.register(cameraReset, tooltip('tooltip.right-toolbar.reset-camera', 'camera.reset'), 'left');
        tooltips.register(settings, tooltip('panel.settings'), 'left');

        // add event handlers

        overlays.on('click', () => events.fire('overlaysPanel.toggleVisible'));
        cameraFrameSelection.on('click', () => events.fire('camera.focus'));
        cameraReset.on('click', () => events.fire('camera.reset'));
        settings.on('click', () => events.fire('settingsPanel.toggleVisible'));

        const setActive = (button: Button, active: boolean) => {
            button.class[active ? 'add' : 'remove']('active');
            button.dom.setAttribute('aria-pressed', String(active));
        };

        cameraSwitch.setValue('orbit');

        events.on('overlaysPanel.visible', (visible: boolean) => setActive(overlays, visible));
        events.on('camera.controlMode', (mode: 'orbit' | 'fly') => cameraSwitch.setValue(mode));
        events.on('settingsPanel.visible', (visible: boolean) => setActive(settings, visible));
    }
}

export { RightToolbar };
