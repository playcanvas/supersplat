import { Button, Element, Container } from 'pcui';
import { Events } from '../events';
import { Tooltips } from './tooltips';

import undoSvg from '../svg/undo.svg';
import redoSvg from '../svg/redo.svg';
import pickerSvg from '../svg/select-picker.svg';
import lassoSvg from '../svg/select-lasso.svg';
import brushSvg from '../svg/select-brush.svg';
import cropSvg from '../svg/crop.svg';

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

        const handleDown = (event: PointerEvent) => {
            event.preventDefault();
            event.stopPropagation();
        };

        this.dom.addEventListener('pointerdown', (event) => {
            handleDown(event);
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

        const brush = new Button({
            id: 'bottom-toolbar-brush',
            class: 'bottom-toolbar-tool'
        });

        const lasso = new Button({
            id: 'bottom-toolbar-lasso',
            class: ['bottom-toolbar-tool', 'disabled']
        });

        const crop = new Button({
            id: 'bottom-toolbar-crop',
            class: ['bottom-toolbar-tool', 'disabled']
        });

        undo.dom.appendChild(createSvg(undoSvg));
        redo.dom.appendChild(createSvg(redoSvg));
        picker.dom.appendChild(createSvg(pickerSvg));
        brush.dom.appendChild(createSvg(brushSvg));
        lasso.dom.appendChild(createSvg(lassoSvg));
        crop.dom.appendChild(createSvg(cropSvg));

        this.append(undo);
        this.append(redo);
        this.append(new Element({ class: 'bottom-toolbar-separator' }));
        this.append(picker);
        this.append(brush);
        this.append(lasso);
        this.append(crop);
        this.append(new Element({ class: 'bottom-toolbar-separator' }));

        undo.dom.addEventListener('click', () => {
            events.fire('edit.undo');
        });

        redo.dom.addEventListener('click', () => {
            events.fire('edit.redo');
        });

        picker.dom.addEventListener('click', () => {
            events.fire('tool.rectSelection');
        });

        events.on('edit.canUndo', (value: boolean) => { undo.enabled = value; });
        events.on('edit.canRedo', (value: boolean) => { redo.enabled = value; });

        brush.dom.addEventListener('click', () => {
            events.fire('tool.brushSelection');
        });

        events.on('tool.activated', (toolName: string) => {
            picker.class[toolName === 'rectSelection' ? 'add' : 'remove']('active');
            brush.class[toolName === 'brushSelection' ? 'add' : 'remove']('active');
        });

        // register tooltips
        tooltips.register(undo, 'Undo');
        tooltips.register(redo, 'Redo');
        tooltips.register(picker, 'Select Picker');
        tooltips.register(brush, 'Select Brush');
        tooltips.register(lasso, 'Select Lasso');
        tooltips.register(crop, 'Crop');
    }
}

export { BottomToolbar };
