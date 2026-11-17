import { Button, Element, Container } from '@playcanvas/pcui';

import type { Events } from '../events';
import type { ShortcutManager } from '../shortcut-manager';

import { i18n } from './localization';
import { MenuPanel } from './menu-panel';
import measureSvg from './svg/measure.svg';
import orientSvg from './svg/orient.svg';
import redoSvg from './svg/redo.svg';
import boxSvg from './svg/select-box.svg';
import brushSvg from './svg/select-brush.svg';
import eyedropperSvg from './svg/select-eyedropper.svg';
import floodSvg from './svg/select-flood.svg';
import lassoSvg from './svg/select-lasso.svg';
import pickerSvg from './svg/select-picker.svg';
import polygonSvg from './svg/select-poly.svg';
import sphereBrushSvg from './svg/select-sphere-brush.svg';
import sphereSvg from './svg/select-sphere.svg';
import undoSvg from './svg/undo.svg';
import type { Tooltips } from './tooltips';
// import cropSvg from './svg/crop.svg';

const createSvg = (svgString: string) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

// press duration that opens a tool group's popup instead of toggling the tool
const HOLD_MS = 400;

type ToolGroupItem = {
    tool: string; // tool manager name
    svg: string; // toolbar icon
    localeKey: string; // tooltip / popup row text
};

class BottomToolbar extends Container {
    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'bottom-toolbar',
            class: 'toolbar-horizontal'
        };

        super(args);

        this.dom.addEventListener('pointerdown', (event) => {
            event.stopPropagation();
        });

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

        // a button standing in for a group of tools. it shows the group's
        // current tool and a click toggles it; press-and-hold opens a popup
        // listing the group, where the user either releases over a row or
        // releases and then clicks one.
        const toolGroup = (id: string, items: ToolGroupItem[]) => {
            const button = new Button({ id, class: ['toolbar-tool', 'toolbar-flyout'] });
            const icons = items.map((item) => button.dom.appendChild(createSvg(item.svg)));

            let current = items[0];

            const setCurrent = (item: ToolGroupItem) => {
                current = item;
                icons.forEach((icon, i) => {
                    icon.style.display = items[i] === item ? '' : 'none';
                });
            };
            setCurrent(current);

            const popup = new MenuPanel(
                items.map((item) => {
                    // toolbar icons draw in the middle of a 38px canvas; crop them
                    // down to the 16px menu icon size
                    const icon = createSvg(item.svg);
                    icon.setAttribute('viewBox', '6 6 26 26');
                    icon.setAttribute('width', '16');
                    icon.setAttribute('height', '16');

                    return {
                        text: () => i18n.t(item.localeKey),
                        icon: new Element({ dom: icon }),
                        extra: shortcutManager.formatShortcut(`tool.${item.tool}`),
                        onSelect: () => {
                            // picking the already active tool keeps it active
                            if (events.invoke('tool.active') !== item.tool) {
                                events.fire(`tool.${item.tool}`);
                            }
                        }
                    };
                })
            );
            this.append(popup);

            // above the button, clearing the active tool's own toolbar (a
            // .select-toolbar floating over the bottom toolbar) if one is shown
            const positionPopup = () => {
                const rect = button.dom.getBoundingClientRect();
                const parentRect = this.dom.getBoundingClientRect();
                const toolbar = document.querySelector('.select-toolbar:not(.pcui-hidden)');
                const top = Math.min(rect.top, toolbar?.getBoundingClientRect().top ?? rect.top);
                popup.dom.style.left = `${rect.left - parentRect.left}px`;
                popup.dom.style.bottom = `${parentRect.bottom - top + 8}px`;
            };

            let timer = -1;
            let suppressToggle = false;

            const cancelHold = () => {
                if (timer !== -1) {
                    clearTimeout(timer);
                    timer = -1;
                }
            };

            button.dom.addEventListener('pointerdown', (event: PointerEvent) => {
                if (event.button !== 0) return;

                // pressing the button while its popup is open just closes it,
                // and the release must not toggle the tool. reset per press:
                // a release off the button never reaches pointerup below.
                suppressToggle = !popup.hidden;
                if (suppressToggle) {
                    popup.hidden = true;
                    return;
                }

                // touch implicitly captures the pointer; release it so a
                // drag-release over a popup row reaches the row
                if (button.dom.hasPointerCapture(event.pointerId)) {
                    button.dom.releasePointerCapture(event.pointerId);
                }

                timer = window.setTimeout(() => {
                    timer = -1;
                    positionPopup();
                    tooltips.hide();
                    popup.hidden = false;
                }, HOLD_MS);
            });

            button.dom.addEventListener('pointerup', (event: PointerEvent) => {
                if (event.button !== 0) return;

                // short press toggles the current tool. after a hold the popup
                // is open and stays open for a click on a row.
                if (timer !== -1) {
                    cancelHold();
                    if (!suppressToggle) {
                        events.fire(`tool.${current.tool}`);
                    }
                }
            });

            // keyboard activation (Enter/Space) and assistive tech arrive as a
            // click with detail 0; pointer clicks are handled above
            button.dom.addEventListener('click', (event: MouseEvent) => {
                if (event.detail === 0) {
                    events.fire(`tool.${current.tool}`);
                }
            });

            button.dom.addEventListener('pointerleave', cancelHold);
            button.dom.addEventListener('pointercancel', cancelHold);

            // close on a press anywhere outside the popup and its button
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

            // track activation from any source (popup, shortcut) so the button
            // always shows the tool that would be toggled next
            events.on('tool.activated', (toolName: string) => {
                const item = items.find((item) => item.tool === toolName);
                if (item) {
                    setCurrent(item);
                }
                button.class[item ? 'add' : 'remove']('active');
            });

            tooltips.register(button, () => tooltip(current.localeKey, `tool.${current.tool}`)());

            return button;
        };

        const undo = new Button({
            id: 'bottom-toolbar-undo',
            class: 'toolbar-button',
            enabled: false
        });

        const redo = new Button({
            id: 'bottom-toolbar-redo',
            class: 'toolbar-button',
            enabled: false
        });

        const picker = new Button({
            id: 'bottom-toolbar-picker',
            class: 'toolbar-tool'
        });

        const brush = new Button({
            id: 'bottom-toolbar-brush',
            class: 'toolbar-tool'
        });

        const polygon = toolGroup('bottom-toolbar-polygon', [
            { tool: 'polygonSelection', svg: polygonSvg, localeKey: 'tooltip.bottom-toolbar.polygon-selection' },
            { tool: 'lassoSelection', svg: lassoSvg, localeKey: 'tooltip.bottom-toolbar.lasso-selection' }
        ]);

        const eyedropper = toolGroup('bottom-toolbar-eyedropper', [
            {
                tool: 'eyedropperSelection',
                svg: eyedropperSvg,
                localeKey: 'tooltip.bottom-toolbar.eyedropper-selection'
            },
            { tool: 'floodSelection', svg: floodSvg, localeKey: 'tooltip.bottom-toolbar.flood-selection' }
        ]);

        const sphereBrush = new Button({
            id: 'bottom-toolbar-sphere-brush',
            class: 'toolbar-tool'
        });

        const sphere = new Button({
            id: 'bottom-toolbar-sphere',
            class: 'toolbar-tool'
        });

        const box = new Button({
            id: 'bottom-toolbar-box',
            class: 'toolbar-tool'
        });

        // const crop = new Button({
        //     id: 'bottom-toolbar-crop',
        //     class: ['toolbar-tool', 'disabled']
        // });

        const move = new Button({
            id: 'bottom-toolbar-move',
            class: 'toolbar-tool',
            icon: 'E111'
        });

        const rotate = new Button({
            id: 'bottom-toolbar-rotate',
            class: 'toolbar-tool',
            icon: 'E113'
        });

        const scale = new Button({
            id: 'bottom-toolbar-scale',
            class: 'toolbar-tool',
            icon: 'E112'
        });

        const measure = new Button({
            id: 'bottom-toolbar-measure',
            class: 'toolbar-tool'
        });

        const orient = new Button({
            id: 'bottom-toolbar-orient',
            class: 'toolbar-tool'
        });

        const coordSpace = new Button({
            id: 'bottom-toolbar-coord-space',
            class: 'toolbar-toggle',
            icon: 'E118'
        });

        const origin = new Button({
            id: 'bottom-toolbar-origin',
            class: 'toolbar-button',
            icon: 'E189'
        });

        undo.dom.appendChild(createSvg(undoSvg));
        redo.dom.appendChild(createSvg(redoSvg));
        picker.dom.appendChild(createSvg(pickerSvg));
        brush.dom.appendChild(createSvg(brushSvg));
        sphereBrush.dom.appendChild(createSvg(sphereBrushSvg));
        sphere.dom.appendChild(createSvg(sphereSvg));
        box.dom.appendChild(createSvg(boxSvg));
        measure.dom.appendChild(createSvg(measureSvg));
        orient.dom.appendChild(createSvg(orientSvg));
        // crop.dom.appendChild(createSvg(cropSvg));

        // each group of tools sits in a well (see toolbar.scss)
        const well = (...tools: Element[]) => {
            const container = new Container({ class: 'toolbar-well' });
            tools.forEach((tool) => container.append(tool));
            return container;
        };

        this.append(undo);
        this.append(redo);
        this.append(new Element({ class: 'toolbar-separator' }));
        this.append(well(picker, brush, polygon, eyedropper));
        this.append(new Element({ class: 'toolbar-separator' }));
        this.append(well(sphereBrush, sphere, box));
        // crop belongs in the well above when it returns
        this.append(new Element({ class: 'toolbar-separator' }));
        this.append(well(move, rotate, scale));
        this.append(new Element({ class: 'toolbar-separator' }));
        this.append(well(measure, orient));
        this.append(coordSpace);
        this.append(origin);

        undo.dom.addEventListener('click', () => events.fire('edit.undo'));
        redo.dom.addEventListener('click', () => events.fire('edit.redo'));

        brush.dom.addEventListener('click', () => events.fire('tool.brushSelection'));
        sphereBrush.dom.addEventListener('click', () => events.fire('tool.sphereBrushSelection'));
        picker.dom.addEventListener('click', () => events.fire('tool.rectSelection'));
        sphere.dom.addEventListener('click', () => events.fire('tool.sphereSelection'));
        box.dom.addEventListener('click', () => events.fire('tool.boxSelection'));
        move.dom.addEventListener('click', () => events.fire('tool.move'));
        rotate.dom.addEventListener('click', () => events.fire('tool.rotate'));
        scale.dom.addEventListener('click', () => events.fire('tool.scale'));
        measure.dom.addEventListener('click', () => events.fire('tool.measure'));
        orient.dom.addEventListener('click', () => events.fire('tool.orient'));
        coordSpace.dom.addEventListener('click', () => events.fire('tool.toggleCoordSpace'));
        origin.dom.addEventListener('click', (e: MouseEvent) => {
            if (events.invoke('tool.active') === 'orient') {
                events.fire('orient.setPivot');
            } else {
                events.fire('pivot.reset', e.shiftKey);
            }
        });

        events.on('edit.canUndo', (value: boolean) => {
            undo.enabled = value;
        });
        events.on('edit.canRedo', (value: boolean) => {
            redo.enabled = value;
        });

        events.on('tool.activated', (toolName: string) => {
            picker.class[toolName === 'rectSelection' ? 'add' : 'remove']('active');
            brush.class[toolName === 'brushSelection' ? 'add' : 'remove']('active');
            sphereBrush.class[toolName === 'sphereBrushSelection' ? 'add' : 'remove']('active');
            sphere.class[toolName === 'sphereSelection' ? 'add' : 'remove']('active');
            box.class[toolName === 'boxSelection' ? 'add' : 'remove']('active');
            move.class[toolName === 'move' ? 'add' : 'remove']('active');
            rotate.class[toolName === 'rotate' ? 'add' : 'remove']('active');
            scale.class[toolName === 'scale' ? 'add' : 'remove']('active');
            measure.class[toolName === 'measure' ? 'add' : 'remove']('active');
            orient.class[toolName === 'orient' ? 'add' : 'remove']('active');
        });

        events.on('tool.coordSpace', (space: 'local' | 'world') => {
            coordSpace.dom.classList[space === 'local' ? 'add' : 'remove']('active');
        });

        // register tooltips
        tooltips.register(undo, tooltip('tooltip.bottom-toolbar.undo', 'edit.undo'));
        tooltips.register(redo, tooltip('tooltip.bottom-toolbar.redo', 'edit.redo'));
        tooltips.register(picker, tooltip('tooltip.bottom-toolbar.rectangle-selection', 'tool.rectSelection'));
        tooltips.register(brush, tooltip('tooltip.bottom-toolbar.brush-selection', 'tool.brushSelection'));
        tooltips.register(
            sphereBrush,
            tooltip('tooltip.bottom-toolbar.sphere-brush-selection', 'tool.sphereBrushSelection')
        );
        tooltips.register(sphere, tooltip('tooltip.bottom-toolbar.sphere-selection'));
        tooltips.register(box, tooltip('tooltip.bottom-toolbar.box-selection'));
        tooltips.register(move, tooltip('tooltip.bottom-toolbar.move', 'tool.moveShortcut'));
        tooltips.register(rotate, tooltip('tooltip.bottom-toolbar.rotate', 'tool.rotateShortcut'));
        tooltips.register(scale, tooltip('tooltip.bottom-toolbar.scale', 'tool.scaleShortcut'));
        tooltips.register(measure, tooltip('tooltip.bottom-toolbar.measure'));
        tooltips.register(orient, tooltip('tooltip.bottom-toolbar.orient'));
        tooltips.register(coordSpace, tooltip('tooltip.bottom-toolbar.local-space', 'tool.toggleCoordSpace'));
        tooltips.register(origin, () =>
            i18n.t(
                events.invoke('tool.active') === 'orient' ? 'orient.set-pivot' : 'tooltip.bottom-toolbar.reset-pivot'
            )
        );
    }
}

export { BottomToolbar };
