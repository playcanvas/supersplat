import type { Element } from '@playcanvas/pcui';
import { BooleanInput, Button, Container, SliderInput } from '@playcanvas/pcui';

import type { Events } from '../events';
import type { ShortcutManager } from '../shortcut-manager';
import type { ViewMode } from '../view-mode';
import { VIEW_MODES } from '../view-mode';

import { i18n } from './localization';
import type { MenuItem } from './menu-panel';
import { MenuPanel } from './menu-panel';
import centersSvg from './svg/centers.svg';
import markersSvg from './svg/markers.svg';
import ringsSvg from './svg/rings.svg';
import xraySvg from './svg/xray.svg';
import { createSwitch } from './toolbar-switch';
import type { Tooltips } from './tooltips';

const createSvg = (svgString: string) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

// press duration that opens a button's flyout instead of pressing it
const HOLD_MS = 400;

const capitalize = (s: string) => `${s[0].toUpperCase()}${s.slice(1)}`;

// The mode strip: an icon toolbar at the top of the viewport carrying the
// three switches that decide what you see and what a drag selects. The
// editing mode (centers or rings) as a two-option switch, the markers switch
// (tab) and the x-ray switch. The few remaining options live in flyouts:
// press and hold the mode switch for the marker's size and colour, the
// markers switch for markers only and the selection's tint and outline. The
// controls are toolbar.scss's, shared with the other toolbars; the names are
// in the tooltips, each a name line over a description
class ModeToolbar extends Container {
    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'mode-toolbar',
            class: 'toolbar-horizontal'
        };

        super(args);

        this.dom.addEventListener('pointerdown', (event) => {
            event.stopPropagation();
        });

        const shortcutManager: ShortcutManager = events.invoke('shortcutManager');

        // a control's tooltip: its name and shortcut, then its description
        const describe = (localeKey: string, shortcutId: string) => () => {
            const shortcut = shortcutManager.formatShortcut(shortcutId);
            const name = i18n.t(localeKey);
            const title = shortcut ? i18n.formatTooltipWithShortcut(name, shortcut) : name;
            return `${title}\n${i18n.t(`${localeKey}.tooltip`)}`;
        };

        const setActive = (element: Element, active: boolean) => {
            element.class[active ? 'add' : 'remove']('active');
            element.dom.setAttribute('aria-pressed', String(active));
        };

        // flyout rows: a switch row flips a view flag and stays open (shown
        // inverted when the row's wording is the flag's opposite); a slider
        // row edits a view value in place. The rows pull the live value when
        // the flyout opens and follow the notify events while it is open
        const switchRow = (localeKey: string, name: string, inverted = false): MenuItem => {
            const toggle = new BooleanInput({ type: 'toggle', class: 'mode-toolbar-menu-switch', value: false });
            // the row handles the press, so the switch only shows the state
            toggle.dom.style.pointerEvents = 'none';
            const update = () => {
                toggle.value = !!events.invoke(`view.${name}`) !== inverted;
            };
            events.on(`view.${name}`, update);
            return {
                text: () => i18n.t(localeKey),
                extra: toggle,
                keepOpen: true,
                isVisible: () => {
                    update();
                    return true;
                },
                onSelect: () => events.fire(`view.set${capitalize(name)}`, !events.invoke(`view.${name}`))
            };
        };

        const sliderRow = (localeKey: string, name: string, min: number, max: number, precision: number): MenuItem => {
            const slider = new SliderInput({ class: 'mode-toolbar-menu-slider', min, max, precision, value: min });
            let syncing = false;
            const update = () => {
                syncing = true;
                slider.value = events.invoke(`view.${name}`) as number;
                syncing = false;
            };
            events.on(`view.${name}`, update);
            slider.on('change', (value: number) => {
                if (!syncing) {
                    events.fire(`view.set${capitalize(name)}`, value);
                }
            });
            return {
                text: () => i18n.t(localeKey),
                extra: slider,
                isVisible: () => {
                    update();
                    return true;
                }
            };
        };

        // press and hold opens a button's flyout below it; a short press runs
        // the button's own action. Pressing
        // again while the flyout is open closes it
        const holdToOpen = (button: Element, popup: MenuPanel, shortPress: () => void) => {
            button.class.add('toolbar-flyout');
            popup.class.add('mode-toolbar-menu');
            this.append(popup);

            let timer = -1;
            let suppress = false;

            const cancelHold = () => {
                if (timer !== -1) {
                    clearTimeout(timer);
                    timer = -1;
                }
            };

            button.dom.addEventListener('pointerdown', (event: PointerEvent) => {
                if (event.button !== 0) return;
                suppress = !popup.hidden;
                if (suppress) {
                    popup.hidden = true;
                    return;
                }
                if (button.dom.hasPointerCapture(event.pointerId)) {
                    button.dom.releasePointerCapture(event.pointerId);
                }
                timer = window.setTimeout(() => {
                    timer = -1;
                    tooltips.hide();
                    // below the strip, flush with its right edge: every flyout
                    // drops into the same place, and none runs off the screen
                    popup.dom.style.left = 'auto';
                    popup.dom.style.right = '0px';
                    popup.dom.style.top = `${this.dom.offsetHeight + 8}px`;
                    popup.hidden = false;
                }, HOLD_MS);
            });

            button.dom.addEventListener('pointerup', (event: PointerEvent) => {
                if (event.button !== 0) return;
                if (timer !== -1) {
                    cancelHold();
                    if (!suppress) {
                        shortPress();
                    }
                }
            });

            // keyboard activation arrives as a click with detail 0
            button.dom.addEventListener('click', (event: MouseEvent) => {
                if (event.detail === 0) {
                    shortPress();
                }
            });

            button.dom.addEventListener('pointerleave', cancelHold);
            button.dom.addEventListener('pointercancel', cancelHold);

            // close on a press anywhere outside the flyout and its button
            window.addEventListener(
                'pointerdown',
                (event: PointerEvent) => {
                    const target = event.target as Node;
                    if (!popup.hidden && !popup.dom.contains(target) && !button.dom.contains(target)) {
                        popup.hidden = true;
                    }
                },
                true
            );
        };

        // the mode: one two-option switch. Each option handles its own presses
        // below, so a hold can open that option's flyout
        const modeSwitch = createSwitch<ViewMode>(
            'horizontal',
            [
                { value: 'centers', svg: centersSvg, localeKey: 'mode-toolbar.centers' },
                { value: 'rings', svg: ringsSvg, localeKey: 'mode-toolbar.rings' }
            ],
            (mode) => events.fire('view.setMode', mode),
            false
        );
        const modeGroup = modeSwitch.container;
        modeGroup.dom.setAttribute('role', 'group');

        modeSwitch.buttons.forEach((button, i) => {
            tooltips.register(button, describe(`mode-toolbar.${VIEW_MODES[i]}`, 'view.toggleMode'), 'bottom');
        });

        // each option's flyout: that marker's size and colour, whichever mode
        // is current. The colour switch reads as "splat colours", the flag as
        // "tint". A short press on an option chooses it
        const modeMenus = [
            new MenuPanel([
                sliderRow('mode-toolbar.center-size', 'centerSize', 0, 10, 1),
                switchRow('mode-toolbar.splat-colors', 'tintCenters', true)
            ]),
            new MenuPanel([
                sliderRow('mode-toolbar.ring-thickness', 'ringSize', 1, 50, 1),
                switchRow('mode-toolbar.splat-colors', 'tintRings', true)
            ])
        ];
        modeSwitch.buttons.forEach((button, i) => {
            holdToOpen(button, modeMenus[i], () => events.fire('view.setMode', VIEW_MODES[i]));
        });

        // an icon toggle, named for assistive tech
        const toggle = (svg: string, localeKey: string) => {
            const button = new Button({ class: 'toolbar-toggle' });
            button.dom.appendChild(createSvg(svg));
            i18n.onChange(() => button.dom.setAttribute('aria-label', i18n.t(localeKey)), button);
            return button;
        };

        // markers (tab): the editing view. Its flyout holds what the editing
        // view shows: markers only, the selection's tint and outline
        const markers = toggle(markersSvg, 'mode-toolbar.markers');
        tooltips.register(markers, describe('mode-toolbar.markers', 'view.toggleEditView'), 'bottom');
        const markersMenu = new MenuPanel([
            switchRow('mode-toolbar.markers-only', 'markersOnly'),
            switchRow('mode-toolbar.selection-tint', 'selectionColor'),
            switchRow('mode-toolbar.selection-outline', 'outlineSelection')
        ]);
        holdToOpen(markers, markersMenu, () => events.fire('view.toggleEditView'));

        // x-ray: screen-space picks go through all depths rather than taking
        // the visible surface. The editor's setting is the inverse (useDepth)
        const xray = toggle(xraySvg, 'mode-toolbar.xray');
        tooltips.register(xray, describe('mode-toolbar.xray', 'selection.toggleUseDepth'), 'bottom');
        xray.on('click', () => events.fire('selection.toggleUseDepth'));

        this.append(modeGroup);
        this.append(markers);
        this.append(xray);

        // the toolbar is constructed before the editor registers its state, so
        // start from the editor's defaults and follow the notify events; a
        // stored preference that differs arrives as one of those
        modeSwitch.setValue('centers');
        setActive(markers, false);
        setActive(xray, true);

        events.on('view.mode', (mode: ViewMode) => modeSwitch.setValue(mode));

        events.on('view.editView', (value: boolean) => setActive(markers, value));
        events.on('selection.useDepth', (value: boolean) => setActive(xray, !value));
    }
}

export { ModeToolbar };
