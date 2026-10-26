import { BooleanInput, ColorPicker, Container, Label, SliderInput } from '@playcanvas/pcui';
import { Color } from 'playcanvas';

import { Events } from '../events';
import { ShortcutManager } from '../shortcut-manager';
import type { ViewMode } from '../view-mode';
import { i18n } from './localization';
import arrowSvg from './svg/arrow.svg';
import centersSvg from './svg/centers.svg';
import resetSvg from './svg/reset.svg';
import ringsSvg from './svg/rings.svg';
import { Tooltips } from './tooltips';

const createSvg = (svgString: string) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

const capitalize = (s: string) => `${s[0].toUpperCase()}${s.slice(1)}`;

type Row = {
    row: Container;
    // pull the live value and the (mode-dependent) label
    sync: () => void;
};

// The appearance panel: the current mode's configuration, opened from the mode
// toolbar. The primary rows cover the mode's own marker for unselected and
// selected gaussians; the other marker, the continuous marker tints and the
// selection tint strengths sit in a collapsed Advanced section, and the
// shared colours in a collapsed Colors section
class AppearancePanel extends Container {
    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'appearance-panel',
            class: ['panel', 'options-panel'],
            hidden: true
        };

        super(args);

        ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick'].forEach((eventName) => {
            this.dom.addEventListener(eventName, (event: Event) => event.stopPropagation());
        });

        const shortcutManager: ShortcutManager = events.invoke('shortcutManager');
        const help = (localeKey: string) => () => i18n.t(localeKey);
        const helpWithShortcut = (localeKey: string, shortcutId: string) => () => {
            const shortcut = shortcutManager.formatShortcut(shortcutId);
            return shortcut ? i18n.formatTooltipWithShortcut(i18n.t(localeKey), shortcut) : i18n.t(localeKey);
        };
        const text = (localeKey: string) => () => i18n.t(localeKey);

        // the mode the panel shows. Followed from the editor's notify event
        // and pulled whenever the panel opens
        let mode: ViewMode = 'centers';
        const otherMode = () => (mode === 'centers' ? 'rings' : 'centers');

        // header: the mode's icon and name, and a reset of the mode's settings

        const header = new Container({
            class: 'panel-header'
        });

        const icon = new Label({
            class: 'panel-header-icon'
        });
        const modeIcons: Record<ViewMode, SVGElement> = {
            centers: createSvg(centersSvg) as unknown as SVGElement,
            rings: createSvg(ringsSvg) as unknown as SVGElement
        };
        icon.dom.appendChild(modeIcons.centers);
        icon.dom.appendChild(modeIcons.rings);

        const label = new Label({
            class: 'panel-header-label'
        });

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

        const updateHeader = () => {
            label.text = i18n.t(`panel.appearance.mode.${mode}`);
            modeIcons.centers.classList[mode === 'centers' ? 'remove' : 'add']('hidden');
            modeIcons.rings.classList[mode === 'rings' ? 'remove' : 'add']('hidden');
        };

        // sections: a header bar and the content container its rows live in.
        // Collapsible ones fold on a click of the header and start folded

        const section = (localeKey: string, collapsible = false) => {
            const bar = new Container({
                class: ['panel-header', 'options-panel-section']
            });
            const sectionLabel = new Label({
                class: 'panel-header-label'
            });
            i18n.bindText(sectionLabel, localeKey);
            bar.append(sectionLabel);

            const content = new Container({
                class: 'options-panel-section-content'
            });

            if (collapsible) {
                bar.class.add('options-panel-collapsible');
                const arrow = new Label({
                    class: 'options-panel-collapse'
                });
                arrow.dom.appendChild(createSvg(arrowSvg));
                bar.append(arrow);
                bar.dom.setAttribute('role', 'button');
                bar.dom.setAttribute('tabindex', '0');

                const setCollapsed = (collapsed: boolean) => {
                    content.hidden = collapsed;
                    bar.class[collapsed ? 'add' : 'remove']('collapsed');
                    bar.dom.setAttribute('aria-expanded', String(!collapsed));
                };
                setCollapsed(true);

                bar.on('click', () => setCollapsed(!content.hidden));
                bar.dom.addEventListener('keydown', (event: KeyboardEvent) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setCollapsed(!content.hidden);
                    }
                });
            }

            return { bar, content };
        };

        // rows. A sync pulls the live value without echoing it back as an
        // edit: a value stored between a toggle's two positions (e.g. a
        // marker tint of 0.3 behind the splat colours switch) must survive
        // the panel opening

        let syncing = false;

        const toggleRow = (labelText: () => string, tooltip: () => string, get: () => boolean, set: (value: boolean) => void): Row => {
            const row = new Container({
                class: ['settings-panel-row', 'options-panel-row-clickable']
            });
            const rowLabel = new Label({
                class: 'settings-panel-row-label'
            });
            const toggle = new BooleanInput({
                type: 'toggle',
                class: 'settings-panel-row-toggle',
                value: false
            });
            row.append(rowLabel);
            row.append(toggle);
            tooltips.register(rowLabel, tooltip, 'top');

            // the whole row flips the switch
            row.dom.addEventListener('click', (event: MouseEvent) => {
                if (toggle.enabled && !toggle.dom.contains(event.target as Node)) {
                    toggle.value = !toggle.value;
                }
            });
            toggle.on('change', (value: boolean) => {
                if (!syncing) {
                    set(value);
                }
            });

            return {
                row,
                sync: () => {
                    rowLabel.text = labelText();
                    toggle.value = get();
                }
            };
        };

        const sliderRow = (labelText: () => string, tooltip: () => string, min: number, max: number, precision: number, get: () => number, set: (value: number) => void): Row => {
            const row = new Container({
                class: 'settings-panel-row'
            });
            const rowLabel = new Label({
                class: 'settings-panel-row-label'
            });
            const slider = new SliderInput({
                class: 'settings-panel-row-slider',
                min,
                max,
                precision,
                value: min
            });
            row.append(rowLabel);
            row.append(slider);
            tooltips.register(rowLabel, tooltip, 'top');

            slider.on('change', (value: number) => {
                if (!syncing) {
                    set(value);
                }
            });

            return {
                row,
                sync: () => {
                    rowLabel.text = labelText();
                    slider.value = get();
                }
            };
        };

        const viewToggle = (name: string, labelText: () => string, tooltip: () => string) => toggleRow(
            labelText, tooltip,
            () => events.invoke(`view.${name}`),
            value => events.fire(`view.set${capitalize(name)}`, value)
        );

        const viewSlider = (name: string, labelText: () => string, tooltip: () => string, min: number, max: number, precision: number) => sliderRow(
            labelText, tooltip, min, max, precision,
            () => events.invoke(`view.${name}`),
            value => events.fire(`view.set${capitalize(name)}`, value)
        );

        // the mode's marker reads "Centers" / "Rings" in the primary sections;
        // the other marker is named in full in Advanced
        const markerText = (marker: ViewMode, group: 'unselected' | 'selected') => () => i18n.t(mode === marker ? `panel.appearance.${marker}` : `panel.appearance.${group}-${marker}`);

        // top rows

        const showMarkers = toggleRow(
            text('panel.appearance.show-markers'), helpWithShortcut('panel.appearance.show-markers.tooltip', 'view.toggleEditView'),
            () => events.invoke('view.editView'),
            value => events.fire('view.setEditView', value)
        );

        const sizeRows: Record<ViewMode, Row> = {
            centers: viewSlider('centerSize', text('panel.appearance.center-size'), help('panel.appearance.center-size.tooltip'), 0, 10, 1),
            rings: viewSlider('ringSize', text('panel.appearance.ring-thickness'), help('panel.appearance.ring-thickness.tooltip'), 1, 50, 1)
        };

        // unselected gaussians

        const unselectedGaussians = viewToggle('gaussians', text('panel.appearance.gaussians'), help('panel.appearance.unselected-gaussians.tooltip'));
        const unselectedMarkers: Record<ViewMode, Row> = {
            centers: viewToggle('centers', markerText('centers', 'unselected'), help('panel.appearance.unselected-centers.tooltip')),
            rings: viewToggle('rings', markerText('rings', 'unselected'), help('panel.appearance.unselected-rings.tooltip'))
        };
        const unselectedTint = viewSlider('splatsColorBlend', text('panel.appearance.tint'), help('panel.appearance.gaussians-unselected-blend.tooltip'), 0, 1, 2);

        // the mode's marker tint as a switch: own colours (blend 0) or the
        // flat unselected colour (blend 1). The continuous value is in Advanced
        const markerBlend: Record<ViewMode, string> = { centers: 'centersColorBlend', rings: 'ringsColorBlend' };
        const splatColors = toggleRow(
            text('panel.appearance.splat-colors'), help('panel.appearance.splat-colors.tooltip'),
            () => (events.invoke(`view.${markerBlend[mode]}`) as number) < 0.5,
            value => events.fire(`view.set${capitalize(markerBlend[mode])}`, value ? 0 : 1)
        );

        // selected gaussians

        const selectedGaussians = viewToggle('selectionGaussians', text('panel.appearance.gaussians'), help('panel.appearance.selected-gaussians.tooltip'));
        const selectedMarkers: Record<ViewMode, Row> = {
            centers: viewToggle('selectionCenters', markerText('centers', 'selected'), help('panel.appearance.selected-centers.tooltip')),
            rings: viewToggle('selectionRings', markerText('rings', 'selected'), help('panel.appearance.selected-rings.tooltip'))
        };
        const selectedTint = viewToggle('selectionColor', text('panel.appearance.tint'), help('panel.appearance.selected-tint.tooltip'));
        const outline = viewToggle('outlineSelection', text('panel.appearance.outline'), help('panel.appearance.outline.tooltip'));

        // advanced: the continuous marker tints and the selection tint
        // strengths; the other marker's rows join these per mode

        const centersTint = viewSlider('centersColorBlend', text('panel.appearance.centers-tint'), help('panel.appearance.centers-unselected-blend.tooltip'), 0, 1, 2);
        const ringsTint = viewSlider('ringsColorBlend', text('panel.appearance.rings-tint'), help('panel.appearance.rings-unselected-blend.tooltip'), 0, 1, 2);
        const gaussiansSelectionTint = viewSlider('splatsSelectionBlend', text('panel.appearance.gaussians'), help('panel.appearance.gaussians-selection-blend.tooltip'), 0, 1, 2);
        const centersSelectionTint = viewSlider('centersSelectionBlend', text('panel.appearance.centers'), help('panel.appearance.centers-selection-blend.tooltip'), 0, 1, 2);
        const ringsSelectionTint = viewSlider('ringsSelectionBlend', text('panel.appearance.rings'), help('panel.appearance.rings-selection-blend.tooltip'), 0, 1, 2);

        // colours, shared by both modes

        const colorsRow = new Container({
            class: 'settings-panel-row'
        });

        const colorsLabel = new Label({
            class: 'settings-panel-row-label'
        });
        i18n.bindText(colorsLabel, 'panel.settings.colors');

        const colorPickers = new Container({
            class: 'settings-panel-row-pickers'
        });

        const bgClrPicker = new ColorPicker({
            class: 'settings-panel-row-picker',
            channels: 3,
            value: [0, 0, 0]
        });

        const selectedClrPicker = new ColorPicker({
            class: 'settings-panel-row-picker',
            channels: 4,
            value: [0, 0, 0, 1]
        });

        const unselectedClrPicker = new ColorPicker({
            class: 'settings-panel-row-picker',
            channels: 4,
            value: [0, 0, 0, 1]
        });

        const lockedClrPicker = new ColorPicker({
            class: 'settings-panel-row-picker',
            channels: 4,
            value: [0, 0, 0, 1]
        });

        const toArray = (clr: Color) => {
            return [clr.r, clr.g, clr.b, clr.a];
        };

        events.on('bgClr', (clr: Color) => {
            bgClrPicker.value = toArray(clr);
        });

        events.on('selectedClr', (clr: Color) => {
            selectedClrPicker.value = toArray(clr);
        });

        events.on('unselectedClr', (clr: Color) => {
            unselectedClrPicker.value = toArray(clr);
        });

        events.on('lockedClr', (clr: Color) => {
            lockedClrPicker.value = toArray(clr);
        });

        colorPickers.append(bgClrPicker);
        colorPickers.append(selectedClrPicker);
        colorPickers.append(unselectedClrPicker);
        colorPickers.append(lockedClrPicker);

        colorsRow.append(colorsLabel);
        colorsRow.append(colorPickers);

        bgClrPicker.on('change', (value: number[]) => {
            events.fire('setBgClr', new Color(value[0], value[1], value[2]));
        });

        selectedClrPicker.on('change', (value: number[]) => {
            events.fire('setSelectedClr', new Color(value[0], value[1], value[2], value[3]));
        });

        unselectedClrPicker.on('change', (value: number[]) => {
            events.fire('setUnselectedClr', new Color(value[0], value[1], value[2], value[3]));
        });

        lockedClrPicker.on('change', (value: number[]) => {
            events.fire('setLockedClr', new Color(value[0], value[1], value[2], value[3]));
        });

        tooltips.register(bgClrPicker, () => i18n.t('panel.settings.background-color'), 'left');
        tooltips.register(selectedClrPicker, () => i18n.t('panel.settings.selected-color'), 'top');
        tooltips.register(unselectedClrPicker, () => i18n.t('panel.settings.unselected-color'), 'top');
        tooltips.register(lockedClrPicker, () => i18n.t('panel.settings.locked-color'), 'top');
        tooltips.register(resetButton, () => i18n.t('panel.settings.reset'), 'left');

        // assembly

        const top = new Container({
            class: 'options-panel-section-content'
        });
        const unselected = section('panel.appearance.section-unselected');
        const selected = section('panel.appearance.section-selected');
        const advanced = section('panel.appearance.section-advanced', true);
        const selectionTint = section('panel.appearance.section-selection-tint');
        const colors = section('panel.settings.colors', true);

        top.append(showMarkers.row);
        unselected.content.append(unselectedGaussians.row);
        unselected.content.append(unselectedTint.row);
        unselected.content.append(splatColors.row);
        selected.content.append(selectedGaussians.row);
        selected.content.append(selectedTint.row);
        selected.content.append(outline.row);
        advanced.content.append(centersTint.row);
        advanced.content.append(ringsTint.row);
        advanced.content.append(selectionTint.bar);
        advanced.content.append(gaussiansSelectionTint.row);
        advanced.content.append(centersSelectionTint.row);
        advanced.content.append(ringsSelectionTint.row);
        colors.content.append(colorsRow);

        this.append(header);
        this.append(top);
        this.append(unselected.bar);
        this.append(unselected.content);
        this.append(selected.bar);
        this.append(selected.content);
        this.append(advanced.bar);
        this.append(advanced.content);
        this.append(colors.bar);
        this.append(colors.content);

        // the mode's marker rows and size sit in the primary sections, the
        // other marker's in Advanced
        const layout = () => {
            const other = otherMode();
            [sizeRows, unselectedMarkers, selectedMarkers].forEach((rows) => {
                (Object.values(rows) as Row[]).forEach(({ row }) => (row.parent as Container)?.remove(row));
            });
            top.append(sizeRows[mode].row);
            unselected.content.appendAfter(unselectedMarkers[mode].row, unselectedGaussians.row);
            selected.content.appendAfter(selectedMarkers[mode].row, selectedGaussians.row);
            advanced.content.appendBefore(unselectedMarkers[other].row, centersTint.row);
            advanced.content.appendBefore(selectedMarkers[other].row, centersTint.row);
            advanced.content.appendBefore(sizeRows[other].row, centersTint.row);
        };

        const rows: Row[] = [
            showMarkers, sizeRows.centers, sizeRows.rings,
            unselectedGaussians, unselectedMarkers.centers, unselectedMarkers.rings, unselectedTint, splatColors,
            selectedGaussians, selectedMarkers.centers, selectedMarkers.rings, selectedTint, outline,
            centersTint, ringsTint, gaussiansSelectionTint, centersSelectionTint, ringsSelectionTint
        ];

        // the unselected rows have no effect while the markers are hidden:
        // dim them, with the switch that explains why directly above. The
        // size rows stay lit: they size the selected markers too
        const unselectedRows = [unselectedGaussians, unselectedMarkers.centers, unselectedMarkers.rings, unselectedTint, splatColors];

        const syncRows = () => {
            syncing = true;
            try {
                rows.forEach(row => row.sync());
                const overridden = !events.invoke('view.editView');
                unselectedRows.forEach(({ row }) => row.class[overridden ? 'add' : 'remove']('overridden'));
            } finally {
                syncing = false;
            }
        };

        const sync = () => {
            mode = events.invoke('view.mode');
            updateHeader();
            layout();
            syncRows();
        };

        // visibility

        const setVisible = (visible: boolean) => {
            if (visible === this.hidden) {
                if (visible) {
                    sync();
                }
                this.hidden = !visible;
                events.fire('appearancePanel.visible', visible);
            }
        };

        events.function('appearancePanel.visible', () => !this.hidden);

        events.on('appearancePanel.setVisible', setVisible);

        events.on('appearancePanel.toggleVisible', () => {
            setVisible(this.hidden);
        });

        events.on('overlaysPanel.visible', (visible: boolean) => {
            if (visible) {
                setVisible(false);
            }
        });

        events.on('settingsPanel.visible', (visible: boolean) => {
            if (visible) {
                setVisible(false);
            }
        });

        resetButton.on('click', () => {
            events.fire('view.resetModeSettings');
        });

        // follow the live state while open

        events.on('view.mode', () => {
            if (!this.hidden) {
                sync();
            }
        });

        [
            'view.editView', 'view.centerSize', 'view.ringSize',
            'view.gaussians', 'view.centers', 'view.rings', 'view.splatsColorBlend', 'view.centersColorBlend', 'view.ringsColorBlend',
            'view.selectionGaussians', 'view.selectionCenters', 'view.selectionRings', 'view.selectionColor', 'view.outlineSelection',
            'view.splatsSelectionBlend', 'view.centersSelectionBlend', 'view.ringsSelectionBlend'
        ].forEach((eventName) => {
            events.on(eventName, () => {
                if (!this.hidden) {
                    syncRows();
                }
            });
        });

        i18n.onChange(() => {
            updateHeader();
            if (!this.hidden) {
                syncRows();
            }
        }, this);

        layout();
    }
}

export { AppearancePanel };
