import { Button, Element, Container } from '@playcanvas/pcui';

import { Events } from '../events';
import { localize } from './localization';
import redoSvg from './svg/redo.svg';
import brushSvg from './svg/select-brush.svg';
import eyedropperSvg from './svg/select-eyedropper.svg';
import floodSvg from './svg/select-flood.svg';
import lassoSvg from './svg/select-lasso.svg';
import pickerSvg from './svg/select-picker.svg';
import polygonSvg from './svg/select-poly.svg';
import sphereSvg from './svg/select-sphere.svg';
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

        const translate = new Button({
            id: 'bottom-toolbar-translate',
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
            class: 'bottom-toolbar-tool',
            icon: 'E358'
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
        flood.dom.appendChild(createSvg(floodSvg));
        sphere.dom.appendChild(createSvg(sphereSvg));
        box.dom.appendChild(createSvg(boxSvg));
        lasso.dom.appendChild(createSvg(lassoSvg));
        eyedropper.dom.appendChild(createSvg(eyedropperSvg));
        // crop.dom.appendChild(createSvg(cropSvg));

        this.append(undo);
        this.append(redo);
        this.append(new Element({ class: 'bottom-toolbar-separator' }));
        this.append(picker);
        this.append(lasso);
        this.append(polygon);
        this.append(brush);
        this.append(flood);
        this.append(eyedropper);
        this.append(new Element({ class: 'bottom-toolbar-separator' }));
        this.append(sphere);
        this.append(box);
        // this.append(crop);
        this.append(new Element({ class: 'bottom-toolbar-separator' }));
        this.append(translate);
        this.append(rotate);
        this.append(scale);
        this.append(new Element({ class: 'bottom-toolbar-separator' }));
        this.append(measure);
        this.append(coordSpace);
        this.append(origin);

        undo.dom.addEventListener('click', () => events.fire('edit.undo'));
        redo.dom.addEventListener('click', () => events.fire('edit.redo'));
        polygon.dom.addEventListener('click', () => events.fire('tool.polygonSelection'));
        lasso.dom.addEventListener('click', () => events.fire('tool.lassoSelection'));
        brush.dom.addEventListener('click', () => events.fire('tool.brushSelection'));
        flood.dom.addEventListener('click', () => events.fire('tool.floodSelection'));
        picker.dom.addEventListener('click', () => events.fire('tool.rectSelection'));
        eyedropper.dom.addEventListener('click', () => events.fire('tool.eyedropperSelection'));
        sphere.dom.addEventListener('click', () => events.fire('tool.sphereSelection'));
        box.dom.addEventListener('click', () => events.fire('tool.boxSelection'));
        translate.dom.addEventListener('click', () => events.fire('tool.move'));
        rotate.dom.addEventListener('click', () => events.fire('tool.rotate'));
        scale.dom.addEventListener('click', () => events.fire('tool.scale'));
        measure.dom.addEventListener('click', () => events.fire('tool.measure'));
        coordSpace.dom.addEventListener('click', () => events.fire('tool.toggleCoordSpace'));
        origin.dom.addEventListener('click', () => events.fire('pivot.toggleOrigin'));

        events.on('edit.canUndo', (value: boolean) => {
            undo.enabled = value;
        });
        events.on('edit.canRedo', (value: boolean) => {
            redo.enabled = value;
        });

        events.on('tool.activated', (toolName: string) => {
            picker.class[toolName === 'rectSelection' ? 'add' : 'remove']('active');
            brush.class[toolName === 'brushSelection' ? 'add' : 'remove']('active');
            flood.class[toolName === 'floodSelection' ? 'add' : 'remove']('active');
            polygon.class[toolName === 'polygonSelection' ? 'add' : 'remove']('active');
            lasso.class[toolName === 'lassoSelection' ? 'add' : 'remove']('active');
            sphere.class[toolName === 'sphereSelection' ? 'add' : 'remove']('active');
            box.class[toolName === 'boxSelection' ? 'add' : 'remove']('active');
            translate.class[toolName === 'move' ? 'add' : 'remove']('active');
            rotate.class[toolName === 'rotate' ? 'add' : 'remove']('active');
            scale.class[toolName === 'scale' ? 'add' : 'remove']('active');
            measure.class[toolName === 'measure' ? 'add' : 'remove']('active');
            eyedropper.class[toolName === 'eyedropperSelection' ? 'add' : 'remove']('active');
        });

        events.on('tool.coordSpace', (space: 'local' | 'world') => {
            coordSpace.dom.classList[space === 'local' ? 'add' : 'remove']('active');
        });

        events.on('pivot.origin', (o: 'center' | 'boundCenter') => {
            origin.dom.classList[o === 'boundCenter' ? 'add' : 'remove']('active');
        });

        // register tooltips
        tooltips.register(undo, localize('tooltip.bottom-toolbar.undo'));
        tooltips.register(redo, localize('tooltip.bottom-toolbar.redo'));
        tooltips.register(picker, localize('tooltip.bottom-toolbar.rect'));
        tooltips.register(lasso, localize('tooltip.bottom-toolbar.lasso'));
        tooltips.register(polygon, localize('tooltip.bottom-toolbar.polygon'));
        tooltips.register(brush, localize('tooltip.bottom-toolbar.brush'));
        tooltips.register(flood, localize('tooltip.bottom-toolbar.flood'));
        tooltips.register(sphere, localize('tooltip.bottom-toolbar.sphere'));
        tooltips.register(box, localize('tooltip.bottom-toolbar.box'));
        tooltips.register(translate, localize('tooltip.bottom-toolbar.translate'));
        tooltips.register(rotate, localize('tooltip.bottom-toolbar.rotate'));
        tooltips.register(scale, localize('tooltip.bottom-toolbar.scale'));
        tooltips.register(measure, localize('tooltip.bottom-toolbar.measure'));
        tooltips.register(coordSpace, localize('tooltip.bottom-toolbar.local-space'));
        tooltips.register(origin, localize('tooltip.bottom-toolbar.bound-center'));
        tooltips.register(eyedropper, localize('tooltip.bottom-toolbar.eyedropper'));
    }
}

export { BottomToolbar };
