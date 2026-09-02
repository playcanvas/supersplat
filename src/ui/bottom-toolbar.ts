import { Button, Element, Container } from '@playcanvas/pcui';

import { Events } from '../events';
import { ShortcutManager } from '../shortcut-manager';
import { i18n } from './localization';
import measureSvg from './svg/measure.svg';
import orientSvg from './svg/orient.svg';
import redoSvg from './svg/redo.svg';
import brushSvg from './svg/select-brush.svg';
import eyedropperSvg from './svg/select-eyedropper.svg';
import floodSvg from './svg/select-flood.svg';
import lassoSvg from './svg/select-lasso.svg';
import pickerSvg from './svg/select-picker.svg';
import polygonSvg from './svg/select-poly.svg';
import sphereSvg from './svg/select-sphere.svg';
import volumeBrushSvg from './svg/select-volume-brush.svg';
import depthOffSvg from './svg/selection-depth-off.svg';
import depthOnSvg from './svg/selection-depth-on.svg';
import footprintCentersSvg from './svg/selection-footprint-centers.svg';
import footprintRingsSvg from './svg/selection-footprint-rings.svg';
import boxSvg from './svg/show-hide-splats.svg';
import undoSvg from './svg/undo.svg';
import { Tooltips } from './tooltips';
// import cropSvg from './svg/crop.svg';

const createSvg = (svgString: string) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

class BottomToolbar extends Container {
    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'bottom-toolbar'
        };

        super(args);

        this.dom.addEventListener('pointerdown', (event) => {
            event.stopPropagation();
        });

        const undo = new Button({
            id: 'bottom-toolbar-undo',
            class: 'bottom-toolbar-button',
            enabled: false
        });

        const redo = new Button({
            id: 'bottom-toolbar-redo',
            class: 'bottom-toolbar-button',
            enabled: false
        });

        // depth toggle: on = only the visible surface picks, off = through all layers
        const selectionMode = new Button({
            id: 'bottom-toolbar-selection-mode',
            class: 'bottom-toolbar-selection-mode-button'
        });

        const depthOnIcon = createSvg(depthOnSvg);
        const depthOffIcon = createSvg(depthOffSvg);
        depthOnIcon.classList.add('bottom-toolbar-selection-mode-icon');
        depthOffIcon.classList.add('bottom-toolbar-selection-mode-icon');
        selectionMode.dom.appendChild(depthOnIcon);
        selectionMode.dom.appendChild(depthOffIcon);

        // footprint toggle: centers (footprint 0) or the full splat footprint
        const footprintMode = new Button({
            id: 'bottom-toolbar-selection-footprint',
            class: 'bottom-toolbar-selection-mode-button'
        });

        const footprintCentersIcon = createSvg(footprintCentersSvg);
        const footprintRingsIcon = createSvg(footprintRingsSvg);
        footprintCentersIcon.classList.add('bottom-toolbar-selection-mode-icon');
        footprintRingsIcon.classList.add('bottom-toolbar-selection-mode-icon');
        footprintMode.dom.appendChild(footprintCentersIcon);
        footprintMode.dom.appendChild(footprintRingsIcon);

        const picker = new Button({
            id: 'bottom-toolbar-picker',
            class: 'bottom-toolbar-tool'
        });

        const polygon = new Button({
            id: 'bottom-toolbar-polygon',
            class: 'bottom-toolbar-tool'
        });

        const brush = new Button({
            id: 'bottom-toolbar-brush',
            class: 'bottom-toolbar-tool'
        });

        const volumeBrush = new Button({
            id: 'bottom-toolbar-volume-brush',
            class: 'bottom-toolbar-tool'
        });

        const flood = new Button({
            id: 'bottom-toolbar-flood',
            class: 'bottom-toolbar-tool'
        });

        const lasso = new Button({
            id: 'bottom-toolbar-lasso',
            class: 'bottom-toolbar-tool'
        });

        const sphere = new Button({
            id: 'bottom-toolbar-sphere',
            class: 'bottom-toolbar-tool'
        });

        const box = new Button({
            id: 'bottom-toolbar-box',
            class: 'bottom-toolbar-tool'
        });

        const eyedropper = new Button({
            id: 'bottom-toolbar-eyedropper',
            class: 'bottom-toolbar-tool'
        });

        // const crop = new Button({
        //     id: 'bottom-toolbar-crop',
        //     class: ['bottom-toolbar-tool', 'disabled']
        // });

        const move = new Button({
            id: 'bottom-toolbar-move',
            class: 'bottom-toolbar-tool',
            icon: 'E111'
        });

        const rotate = new Button({
            id: 'bottom-toolbar-rotate',
            class: 'bottom-toolbar-tool',
            icon: 'E113'
        });

        const scale = new Button({
            id: 'bottom-toolbar-scale',
            class: 'bottom-toolbar-tool',
            icon: 'E112'
        });

        const measure = new Button({
            id: 'bottom-toolbar-measure',
            class: 'bottom-toolbar-tool'
        });

        const orient = new Button({
            id: 'bottom-toolbar-orient',
            class: 'bottom-toolbar-tool'
        });

        const coordSpace = new Button({
            id: 'bottom-toolbar-coord-space',
            class: 'bottom-toolbar-toggle',
            icon: 'E118'
        });

        const origin = new Button({
            id: 'bottom-toolbar-origin',
            class: ['bottom-toolbar-toggle'],
            icon: 'E189'
        });

        undo.dom.appendChild(createSvg(undoSvg));
        redo.dom.appendChild(createSvg(redoSvg));
        picker.dom.appendChild(createSvg(pickerSvg));
        polygon.dom.appendChild(createSvg(polygonSvg));
        brush.dom.appendChild(createSvg(brushSvg));
        volumeBrush.dom.appendChild(createSvg(volumeBrushSvg));
        flood.dom.appendChild(createSvg(floodSvg));
        sphere.dom.appendChild(createSvg(sphereSvg));
        box.dom.appendChild(createSvg(boxSvg));
        lasso.dom.appendChild(createSvg(lassoSvg));
        eyedropper.dom.appendChild(createSvg(eyedropperSvg));
        measure.dom.appendChild(createSvg(measureSvg));
        orient.dom.appendChild(createSvg(orientSvg));
        // crop.dom.appendChild(createSvg(cropSvg));

        this.append(undo);
        this.append(redo);
        this.append(new Element({ class: 'bottom-toolbar-separator' }));
        this.append(footprintMode);
        this.append(selectionMode);
        this.append(new Element({ class: 'bottom-toolbar-separator' }));
        this.append(picker);
        this.append(lasso);
        this.append(polygon);
        this.append(brush);
        this.append(flood);
        this.append(eyedropper);
        this.append(new Element({ class: 'bottom-toolbar-separator' }));
        this.append(volumeBrush);
        this.append(sphere);
        this.append(box);
        // this.append(crop);
        this.append(new Element({ class: 'bottom-toolbar-separator' }));
        this.append(move);
        this.append(rotate);
        this.append(scale);
        this.append(new Element({ class: 'bottom-toolbar-separator' }));
        this.append(measure);
        this.append(orient);
        this.append(coordSpace);
        this.append(origin);

        undo.dom.addEventListener('click', () => events.fire('edit.undo'));
        redo.dom.addEventListener('click', () => events.fire('edit.redo'));

        selectionMode.dom.addEventListener('click', () => {
            events.fire('selection.toggleUseDepth');
        });

        footprintMode.dom.addEventListener('click', () => {
            events.fire('selection.toggleFootprint');
        });
        polygon.dom.addEventListener('click', () => events.fire('tool.polygonSelection'));
        lasso.dom.addEventListener('click', () => events.fire('tool.lassoSelection'));
        brush.dom.addEventListener('click', () => events.fire('tool.brushSelection'));
        volumeBrush.dom.addEventListener('click', () => events.fire('tool.volumeBrushSelection'));
        flood.dom.addEventListener('click', () => events.fire('tool.floodSelection'));
        picker.dom.addEventListener('click', () => events.fire('tool.rectSelection'));
        eyedropper.dom.addEventListener('click', () => events.fire('tool.eyedropperSelection'));
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

        const updateUseDepth = (useDepth: boolean) => {
            depthOnIcon.style.display = useDepth ? '' : 'none';
            depthOffIcon.style.display = useDepth ? 'none' : '';
            selectionMode.dom.setAttribute('aria-pressed', String(useDepth));
            selectionMode.dom.setAttribute('aria-label', i18n.t('tooltip.bottom-toolbar.use-depth'));
        };

        events.on('selection.useDepth', updateUseDepth);

        const updateFootprint = (footprint: number) => {
            const rings = footprint > 0;
            footprintRingsIcon.style.display = rings ? '' : 'none';
            footprintCentersIcon.style.display = rings ? 'none' : '';
            footprintMode.dom.setAttribute('aria-pressed', String(rings));
            footprintMode.dom.setAttribute('aria-label', i18n.t('tooltip.bottom-toolbar.footprint'));
        };

        events.on('selection.footprint', updateFootprint);

        // runs now (initial state) and on language change, so the accessible
        // names never go stale
        i18n.onChange(() => {
            updateUseDepth(!!events.invoke('selection.useDepth'));
            updateFootprint((events.invoke('selection.footprint') as number) ?? 0);
        }, this);

        events.on('tool.activated', (toolName: string) => {
            picker.class[toolName === 'rectSelection' ? 'add' : 'remove']('active');
            brush.class[toolName === 'brushSelection' ? 'add' : 'remove']('active');
            volumeBrush.class[toolName === 'volumeBrushSelection' ? 'add' : 'remove']('active');
            flood.class[toolName === 'floodSelection' ? 'add' : 'remove']('active');
            polygon.class[toolName === 'polygonSelection' ? 'add' : 'remove']('active');
            lasso.class[toolName === 'lassoSelection' ? 'add' : 'remove']('active');
            sphere.class[toolName === 'sphereSelection' ? 'add' : 'remove']('active');
            box.class[toolName === 'boxSelection' ? 'add' : 'remove']('active');
            move.class[toolName === 'move' ? 'add' : 'remove']('active');
            rotate.class[toolName === 'rotate' ? 'add' : 'remove']('active');
            scale.class[toolName === 'scale' ? 'add' : 'remove']('active');
            measure.class[toolName === 'measure' ? 'add' : 'remove']('active');
            orient.class[toolName === 'orient' ? 'add' : 'remove']('active');
            eyedropper.class[toolName === 'eyedropperSelection' ? 'add' : 'remove']('active');
        });

        events.on('tool.coordSpace', (space: 'local' | 'world') => {
            coordSpace.dom.classList[space === 'local' ? 'add' : 'remove']('active');
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

        // register tooltips
        tooltips.register(undo, tooltip('tooltip.bottom-toolbar.undo', 'edit.undo'));
        tooltips.register(redo, tooltip('tooltip.bottom-toolbar.redo', 'edit.redo'));
        tooltips.register(selectionMode, tooltip('tooltip.bottom-toolbar.use-depth', 'selection.toggleUseDepth'));
        tooltips.register(footprintMode, tooltip('tooltip.bottom-toolbar.footprint', 'selection.toggleFootprint'));
        tooltips.register(picker, tooltip('tooltip.bottom-toolbar.rectangle-selection', 'tool.rectSelection'));
        tooltips.register(lasso, tooltip('tooltip.bottom-toolbar.lasso-selection', 'tool.lassoSelection'));
        tooltips.register(polygon, tooltip('tooltip.bottom-toolbar.polygon-selection', 'tool.polygonSelection'));
        tooltips.register(brush, tooltip('tooltip.bottom-toolbar.brush-selection', 'tool.brushSelection'));
        tooltips.register(volumeBrush, tooltip('tooltip.bottom-toolbar.volume-brush-selection', 'tool.volumeBrushSelection'));
        tooltips.register(flood, tooltip('tooltip.bottom-toolbar.flood-selection', 'tool.floodSelection'));
        tooltips.register(sphere, tooltip('tooltip.bottom-toolbar.sphere-selection'));
        tooltips.register(box, tooltip('tooltip.bottom-toolbar.box-selection'));
        tooltips.register(move, tooltip('tooltip.bottom-toolbar.move', 'tool.moveShortcut'));
        tooltips.register(rotate, tooltip('tooltip.bottom-toolbar.rotate', 'tool.rotateShortcut'));
        tooltips.register(scale, tooltip('tooltip.bottom-toolbar.scale', 'tool.scaleShortcut'));
        tooltips.register(measure, tooltip('tooltip.bottom-toolbar.measure'));
        tooltips.register(orient, tooltip('tooltip.bottom-toolbar.orient'));
        tooltips.register(coordSpace, tooltip('tooltip.bottom-toolbar.local-space', 'tool.toggleCoordSpace'));
        tooltips.register(origin, () => i18n.t(
            events.invoke('tool.active') === 'orient' ? 'orient.set-pivot' : 'tooltip.bottom-toolbar.reset-pivot'
        ));
        tooltips.register(eyedropper, tooltip('tooltip.bottom-toolbar.eyedropper-selection', 'tool.eyedropperSelection'));
    }
}

export { BottomToolbar };
