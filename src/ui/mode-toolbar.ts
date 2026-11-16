import { Button, Container, Element, Label } from '@playcanvas/pcui';

import type { Events } from '../events';
import type { ShortcutManager } from '../shortcut-manager';
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
import type { Tooltips } from './tooltips';

const createSvg = (svgString: string) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

// The mode toolbar, a slim pill at the right end of the header row: the
// editing mode (centers or rings) as one sliding two-state switch, the pick
// depth switch beside it, the markers switch (tab), and the buttons of the two
// display panels (overlays, appearance). Everything about what is drawn and
// how picks work lives here, labelled and always on screen; the right toolbar
// is left to the camera
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

        // the toolbar is constructed before the editor registers its state, so
        // start from the editor's defaults and follow the notify events; a
        // stored preference that differs arrives as one of those
        let viewMode: ViewMode = 'centers';

        // state shows by styling alone, as every other toggle in the editor
        const setActive = (element: Element, active: boolean) => {
            element.class[active ? 'add' : 'remove']('active');
            element.dom.setAttribute('aria-pressed', String(active));
        };

        // an icon + text segment. With two icons or two labels, the first
        // shows while the segment is active and the second while it is not.
        // Both labels are laid out so the segment keeps the wider one's width
        // whichever is showing, and the pill never changes size
        const segment = (cls: string, svgs: string[], labelKeys: string[]) => {
            const button = new Button({ class: ['mode-toolbar-labelled', cls] });
            const icons = svgs.map((svg) => button.dom.appendChild(createSvg(svg)));
            const stack = new Container({ class: 'mode-toolbar-label-stack' });
            const labels = labelKeys.map((key) => {
                const label = new Label({ class: 'mode-toolbar-label' });
                i18n.bindText(label, key);
                stack.append(label);
                return label;
            });
            button.dom.appendChild(stack.dom);
            const setState = (active: boolean) => {
                setActive(button, active);
                if (icons.length > 1) {
                    icons[0].style.display = active ? '' : 'none';
                    icons[1].style.display = active ? 'none' : '';
                }
                if (labels.length > 1) {
                    labels[0].class[active ? 'remove' : 'add']('mode-toolbar-label-inactive');
                    labels[1].class[active ? 'add' : 'remove']('mode-toolbar-label-inactive');
                }
            };
            return { button, setState };
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

        // the mode: one two-state switch. Its halves are labels, the highlight
        // slides to the active one, and a click anywhere on it flips the mode.
        // The tooltip states the current mode's pick rule with that mode's
        // live depth setting, so it never promises a default the user changed
        const modes: { mode: ViewMode; svg: string }[] = [
            { mode: 'centers', svg: centersSvg },
            { mode: 'rings', svg: ringsSvg }
        ];

        const modeGroup = new Container({ class: ['mode-toolbar-group', 'mode-toolbar-group-flat'] });
        modeGroup.dom.setAttribute('role', 'button');
        modeGroup.dom.setAttribute('tabindex', '0');

        const thumb = new Element({ class: 'mode-toolbar-thumb' });
        modeGroup.append(thumb);

        const halves = modes.map(({ mode, svg }) => {
            const half = new Container({ class: 'mode-toolbar-mode' });
            half.dom.appendChild(createSvg(svg));
            const label = new Label({ class: 'mode-toolbar-label' });
            i18n.bindText(label, `mode-toolbar.${mode}`);
            half.append(label);
            modeGroup.append(half);
            return { mode, half };
        });

        modeGroup.on('click', () => events.fire('view.toggleMode'));
        modeGroup.dom.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                events.fire('view.toggleMode');
            }
        });
        tooltips.register(
            modeGroup,
            () => {
                const settings = events.invoke(`view.${viewMode}Settings`) as ModeSettings;
                const depth = settings?.useDepth ? 'visible' : 'through';
                return withShortcut(i18n.t(`mode-toolbar.${viewMode}.tooltip.${depth}`), 'view.toggleMode');
            },
            'bottom'
        );

        // the highlight covers the active half. Measured rather than styled
        // because the halves are as wide as their text in the current language.
        // The first placement is instant; later ones slide
        let placed = false;
        const positionThumb = () => {
            const active = halves.find(({ mode }) => mode === viewMode)?.half.dom;
            if (!active || active.offsetWidth === 0) {
                return;
            }
            thumb.dom.style.left = `${active.offsetLeft}px`;
            thumb.dom.style.width = `${active.offsetWidth}px`;
            modeGroup.class[viewMode === 'centers' ? 'add' : 'remove']('mode-toolbar-group-left');
            modeGroup.class[viewMode === 'rings' ? 'add' : 'remove']('mode-toolbar-group-right');
            if (!placed) {
                placed = true;
                requestAnimationFrame(() => thumb.class.add('mode-toolbar-thumb-animated'));
            }
        };

        // relayout (first display, a language change) moves the halves
        new ResizeObserver(positionThumb).observe(modeGroup.dom);

        const updateMode = () => {
            halves.forEach(({ mode, half }) => half.class[mode === viewMode ? 'add' : 'remove']('active'));
            modeGroup.dom.setAttribute('aria-label', i18n.t(`panel.appearance.mode.${viewMode}`));
            positionThumb();
        };

        // depth switch: "Visible only" while screen-space picks take the
        // frontmost surface, "Through all" while they take every depth. It
        // edits the current mode's setting (see view-mode.ts), so it shows the
        // mode's default until the user changes it for that mode
        const depth = segment(
            'mode-toolbar-toggle',
            [depthOnSvg, depthOffSvg],
            ['mode-toolbar.visible-only', 'mode-toolbar.through-all']
        );
        i18n.onChange(
            () => depth.button.dom.setAttribute('aria-label', i18n.t('mode-toolbar.visible-only')),
            depth.button
        );
        tooltips.register(
            depth.button,
            () => withShortcut(i18n.t('mode-toolbar.visible-only.tooltip'), 'selection.toggleUseDepth'),
            'bottom'
        );
        depth.button.on('click', () => events.fire('selection.toggleUseDepth'));

        // markers switch (tab): a constant label, the icon struck out while off
        const markers = segment('mode-toolbar-toggle', [markersSvg, markersOffSvg], ['mode-toolbar.markers']);
        i18n.onChange(
            () => markers.button.dom.setAttribute('aria-label', i18n.t('mode-toolbar.markers')),
            markers.button
        );
        tooltips.register(
            markers.button,
            () => withShortcut(i18n.t('mode-toolbar.markers.tooltip'), 'view.toggleEditView'),
            'bottom'
        );
        markers.button.on('click', () => events.fire('view.toggleEditView'));

        // the display panels
        const appearance = panelButton(
            appearanceSvg,
            'panel.appearance',
            'appearancePanel.toggleVisible',
            'appearancePanel.visible'
        );
        // its artwork carries its own padding; sized up to match the eye
        appearance.class.add('mode-toolbar-button-appearance');
        const overlays = panelButton(
            overlaysSvg,
            'panel.overlays',
            'overlaysPanel.toggleVisible',
            'overlaysPanel.visible'
        );

        this.append(modeGroup);
        this.append(depth.button);
        this.append(markers.button);
        this.append(new Element({ class: 'mode-toolbar-separator' }));
        this.append(appearance);
        this.append(overlays);

        updateMode();
        depth.setState(false);
        markers.setState(false);

        events.on('view.mode', (mode: ViewMode) => {
            viewMode = mode;
            updateMode();
        });

        events.on('selection.useDepth', (value: boolean) => depth.setState(value));
        events.on('view.editView', (value: boolean) => markers.setState(value));

        // the accessible name follows the language
        i18n.onChange(updateMode, this);
    }
}

export { ModeToolbar };
