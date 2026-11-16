import { Button, Container, Element, Label } from '@playcanvas/pcui';

import type { Events } from '../events';
import type { ShortcutManager } from '../shortcut-manager';
import type { ViewMode } from '../view-mode';

import { i18n } from './localization';
import centersSvg from './svg/centers.svg';
import ringsSvg from './svg/rings.svg';
import xraySvg from './svg/xray.svg';
import type { Tooltips } from './tooltips';

const createSvg = (svgString: string) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

// The mode toolbar: a slim strip centred at the top of the viewport carrying
// the two things that decide what a drag selects. The editing mode (centers
// or rings) as one sliding two-state switch, and the x-ray switch beside it.
// Labelled and always on screen; everything else about the viewport lives on
// the right toolbar
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

        // the mode: one two-state switch. Its halves are labels, the highlight
        // slides to the active one, and a click anywhere on it flips the mode
        const modes: { mode: ViewMode; svg: string }[] = [
            { mode: 'centers', svg: centersSvg },
            { mode: 'rings', svg: ringsSvg }
        ];

        const modeGroup = new Container({ class: 'mode-toolbar-group' });
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
            () => withShortcut(i18n.t(`mode-toolbar.${viewMode}.tooltip`), 'view.toggleMode'),
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

        const updateMode = () => {
            halves.forEach(({ mode, half }) => half.class[mode === viewMode ? 'add' : 'remove']('active'));
            modeGroup.dom.setAttribute('aria-label', i18n.t(`panel.appearance.mode.${viewMode}`));
            positionThumb();
        };

        // x-ray: screen-space picks go through all depths rather than taking
        // the visible surface. The editor's setting is the inverse (useDepth)
        const xray = new Button({ class: 'mode-toolbar-toggle' });
        xray.dom.appendChild(createSvg(xraySvg));
        const xrayLabel = new Label({ class: 'mode-toolbar-label' });
        i18n.bindText(xrayLabel, 'mode-toolbar.xray');
        xray.dom.appendChild(xrayLabel.dom);
        i18n.onChange(() => xray.dom.setAttribute('aria-label', i18n.t('mode-toolbar.xray')), xray);
        tooltips.register(
            xray,
            () => withShortcut(i18n.t('mode-toolbar.xray.tooltip'), 'selection.toggleUseDepth'),
            'bottom'
        );
        xray.on('click', () => events.fire('selection.toggleUseDepth'));

        const setXray = (active: boolean) => {
            xray.class[active ? 'add' : 'remove']('active');
            xray.dom.setAttribute('aria-pressed', String(active));
        };

        this.append(modeGroup);
        this.append(xray);

        // centred on the viewport, but never over the menu bar: at narrow
        // widths it sits just right of the menu bar instead
        const place = () => {
            const parent = this.dom.parentElement;
            if (!parent || this.dom.offsetWidth === 0) {
                return;
            }
            const menuBar = document.getElementById('menu-bar');
            const menuRight = menuBar ? menuBar.offsetLeft + menuBar.offsetWidth : 0;
            const centred = Math.round((parent.clientWidth - this.dom.offsetWidth) / 2);
            this.dom.style.left = `${Math.max(menuRight + 16, centred)}px`;
        };

        // relayout (first display, a window or language change) moves the
        // halves and the strip
        let parentObserved = false;
        new ResizeObserver(() => {
            positionThumb();
            place();
            if (!parentObserved && this.dom.parentElement) {
                parentObserved = true;
                new ResizeObserver(place).observe(this.dom.parentElement);
            }
        }).observe(this.dom);

        updateMode();
        setXray(true);

        events.on('view.mode', (mode: ViewMode) => {
            viewMode = mode;
            updateMode();
        });

        events.on('selection.useDepth', (value: boolean) => setXray(!value));

        // the accessible name follows the language
        i18n.onChange(updateMode, this);
    }
}

export { ModeToolbar };
