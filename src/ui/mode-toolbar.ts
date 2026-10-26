import { Button, Container, Element, Label } from '@playcanvas/pcui';

import { Events } from '../events';
import { ShortcutManager } from '../shortcut-manager';
import type { ModeSettings, ViewMode } from '../view-mode';
import { i18n } from './localization';
import appearanceSvg from './svg/appearance.svg';
import centersSvg from './svg/centers.svg';
import markersOffSvg from './svg/markers-off.svg';
import markersSvg from './svg/markers.svg';
import overlaysSvg from './svg/overlays.svg';
import ringsSvg from './svg/rings.svg';
import depthOffSvg from './svg/selection-depth-off.svg';
import depthOnSvg from './svg/selection-depth-on.svg';
import { Tooltips } from './tooltips';

const createSvg = (svgString: string) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

// The mode toolbar, a slim pill at the right end of the header row: the
// editing mode (centers or rings), the markers switch (tab), the pick depth
// switch, and the buttons of the two display panels (overlays, appearance).
// Everything about what is drawn and how picks work lives here, labelled and
// always on screen; the right toolbar is left to the camera
class ModeToolbar extends Container {
    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'mode-toolbar'
        };

        super(args);

        this.dom.addEventListener('pointerdown', (event) => {
            event.stopPropagation();
        });

        const shortcutManager: ShortcutManager = events.invoke('shortcutManager');

        const withShortcut = (text: string, shortcutId: string) => {
            const shortcut = shortcutManager.formatShortcut(shortcutId);
            return shortcut ? i18n.formatTooltipWithShortcut(text, shortcut) : text;
        };

        // state shows by styling alone, as every other toggle in the editor
        const setActive = (button: Button, active: boolean) => {
            button.class[active ? 'add' : 'remove']('active');
            button.dom.setAttribute('aria-pressed', String(active));
        };

        // an icon + text segment. With two icons, the first shows while the
        // segment is active and the second while it is not
        const segment = (cls: string, svgs: string[]) => {
            const button = new Button({ class: ['mode-toolbar-labelled', cls] });
            const icons = svgs.map(svg => button.dom.appendChild(createSvg(svg)));
            const label = new Label({ class: 'mode-toolbar-label' });
            button.dom.appendChild(label.dom);
            const setState = (active: boolean) => {
                setActive(button, active);
                if (icons.length > 1) {
                    icons[0].style.display = active ? '' : 'none';
                    icons[1].style.display = active ? 'none' : '';
                }
            };
            return { button, label, setState };
        };

        // an icon-only button that opens a panel, lit while the panel is open
        const panelButton = (svg: string, localeKey: string, toggleEvent: string, visibleEvent: string) => {
            const button = new Button({ class: 'mode-toolbar-button' });
            button.dom.appendChild(createSvg(svg));
            i18n.onChange(() => button.dom.setAttribute('aria-label', i18n.t(localeKey)), button);
            tooltips.register(button, () => i18n.t(localeKey), 'bottom');
            button.on('click', () => events.fire(toggleEvent));
            events.on(visibleEvent, (visible: boolean) => setActive(button, visible));
            return button;
        };

        // mode segments. The tooltip states the mode's pick rule with that
        // mode's live depth setting, so it never promises a default the user
        // has changed
        const modes: { mode: ViewMode, svg: string }[] = [
            { mode: 'centers', svg: centersSvg },
            { mode: 'rings', svg: ringsSvg }
        ];

        const modeButtons = modes.map(({ mode, svg }) => {
            const { button, label, setState } = segment('mode-toolbar-mode', [svg]);
            i18n.bindText(label, `mode-toolbar.${mode}`);
            i18n.onChange(() => button.dom.setAttribute('aria-label', i18n.t(`panel.appearance.mode.${mode}`)), button);
            tooltips.register(button, () => {
                const settings = events.invoke(`view.${mode}Settings`) as ModeSettings;
                const depth = settings?.useDepth ? 'visible' : 'through';
                return withShortcut(i18n.t(`mode-toolbar.${mode}.tooltip.${depth}`), 'view.toggleMode');
            }, 'bottom');
            button.on('click', () => events.fire('view.setMode', mode));
            return { mode, button, setState };
        });

        // markers switch (tab): a constant label, the icon struck out while off
        const markers = segment('mode-toolbar-toggle', [markersSvg, markersOffSvg]);
        i18n.bindText(markers.label, 'mode-toolbar.markers');
        i18n.onChange(() => markers.button.dom.setAttribute('aria-label', i18n.t('mode-toolbar.markers')), markers.button);
        tooltips.register(markers.button, () => withShortcut(i18n.t('mode-toolbar.markers.tooltip'), 'view.toggleEditView'), 'bottom');
        markers.button.on('click', () => events.fire('view.toggleEditView'));

        // depth switch: lit while screen-space picks take the visible surface
        // only. It edits the current mode's setting (see view-mode.ts), so it
        // shows the mode's default until the user changes it for that mode
        const depth = segment('mode-toolbar-toggle', [depthOnSvg, depthOffSvg]);
        i18n.bindText(depth.label, 'mode-toolbar.visible-only');
        i18n.onChange(() => depth.button.dom.setAttribute('aria-label', i18n.t('mode-toolbar.visible-only')), depth.button);
        tooltips.register(depth.button, () => withShortcut(i18n.t('mode-toolbar.visible-only.tooltip'), 'selection.toggleUseDepth'), 'bottom');
        depth.button.on('click', () => events.fire('selection.toggleUseDepth'));

        // the display panels
        const overlays = panelButton(overlaysSvg, 'panel.overlays', 'overlaysPanel.toggleVisible', 'overlaysPanel.visible');
        const appearance = panelButton(appearanceSvg, 'panel.appearance', 'appearancePanel.toggleVisible', 'appearancePanel.visible');

        modeButtons.forEach(({ button }) => this.append(button));
        this.append(markers.button);
        this.append(depth.button);
        this.append(new Element({ class: 'mode-toolbar-separator' }));
        this.append(overlays);
        this.append(appearance);

        // the toolbar is constructed before the editor registers its state, so
        // start from the editor's defaults and follow the notify events; a
        // stored preference that differs arrives as one of those
        let viewMode: ViewMode = 'centers';

        const updateMode = () => {
            modeButtons.forEach(({ mode, setState }) => setState(mode === viewMode));
        };
        updateMode();
        markers.setState(false);
        depth.setState(false);

        events.on('view.mode', (mode: ViewMode) => {
            viewMode = mode;
            updateMode();
        });

        events.on('view.editView', (value: boolean) => markers.setState(value));
        events.on('selection.useDepth', (value: boolean) => depth.setState(value));
    }
}

export { ModeToolbar };
