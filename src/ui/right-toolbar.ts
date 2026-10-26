import { Button, Container, Element, Label } from '@playcanvas/pcui';

import { Events } from '../events';
import { ShortcutManager } from '../shortcut-manager';
import { i18n } from './localization';
import cameraFrameSelectionSvg from './svg/camera-frame-selection.svg';
import cameraResetSvg from './svg/camera-reset.svg';
import flyCameraSvg from './svg/fly-camera.svg';
import orbitCameraSvg from './svg/orbit-camera.svg';
import { Tooltips } from './tooltips';

const createSvg = (svgString: string) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

class RightToolbar extends Container {
    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'right-toolbar'
        };

        super(args);

        this.dom.addEventListener('pointerdown', (event) => {
            event.stopPropagation();
        });

        const orbitMode = new Button({
            id: 'right-toolbar-orbit-mode',
            class: ['right-toolbar-toggle', 'active']
        });

        const flyMode = new Button({
            id: 'right-toolbar-fly-mode',
            class: 'right-toolbar-toggle'
        });

        const cameraFrameSelection = new Button({
            id: 'right-toolbar-frame-selection',
            class: 'right-toolbar-button'
        });

        const cameraReset = new Button({
            id: 'right-toolbar-camera-origin',
            class: 'right-toolbar-button'
        });

        const settings = new Button({
            id: 'right-toolbar-settings',
            class: 'right-toolbar-toggle',
            icon: 'E283'
        });

        orbitMode.dom.appendChild(createSvg(orbitCameraSvg));
        flyMode.dom.appendChild(createSvg(flyCameraSvg));
        cameraFrameSelection.dom.appendChild(createSvg(cameraFrameSelectionSvg));
        cameraReset.dom.appendChild(createSvg(cameraResetSvg));

        // icon-only buttons: keep accessible names in sync with the language
        const buttonLabels: [Button, string][] = [
            [orbitMode, 'tooltip.right-toolbar.orbit-camera'],
            [flyMode, 'tooltip.right-toolbar.fly-camera'],
            [cameraFrameSelection, 'tooltip.right-toolbar.frame-selection'],
            [cameraReset, 'tooltip.right-toolbar.reset-camera'],
            [settings, 'panel.settings']
        ];
        buttonLabels.forEach(([button, key]) => {
            i18n.onChange(() => button.dom.setAttribute('aria-label', i18n.t(key)), button);
        });

        this.append(orbitMode);
        this.append(flyMode);
        this.append(new Element({ class: 'right-toolbar-separator' }));
        this.append(cameraFrameSelection);
        this.append(cameraReset);
        this.append(new Element({ class: 'right-toolbar-separator' }));
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

        tooltips.register(orbitMode, tooltip('tooltip.right-toolbar.orbit-camera', 'camera.toggleControlMode'), 'left');
        tooltips.register(flyMode, tooltip('tooltip.right-toolbar.fly-camera', 'camera.toggleControlMode'), 'left');
        tooltips.register(cameraFrameSelection, tooltip('tooltip.right-toolbar.frame-selection', 'camera.focus'), 'left');
        tooltips.register(cameraReset, tooltip('tooltip.right-toolbar.reset-camera', 'camera.reset'), 'left');
        tooltips.register(settings, tooltip('panel.settings'), 'left');

        // add event handlers

        orbitMode.on('click', () => events.fire('camera.setControlMode', 'orbit'));
        flyMode.on('click', () => events.fire('camera.setControlMode', 'fly'));
        cameraFrameSelection.on('click', () => events.fire('camera.focus'));
        cameraReset.on('click', () => events.fire('camera.reset'));
        settings.on('click', () => events.fire('settingsPanel.toggleVisible'));

        events.on('camera.controlMode', (mode: 'orbit' | 'fly') => {
            orbitMode.class[mode === 'orbit' ? 'add' : 'remove']('active');
            flyMode.class[mode === 'fly' ? 'add' : 'remove']('active');
        });

        events.on('settingsPanel.visible', (visible: boolean) => {
            settings.class[visible ? 'add' : 'remove']('active');
        });
    }
}

export { RightToolbar };
