import { Button, Element, Container } from 'pcui';
import { Events } from '../events';

import undoSvg from '../svg/undo.svg';
import redoSvg from '../svg/redo.svg';
import pickerSvg from '../svg/select-picker.svg';
import lassoSvg from '../svg/select-lasso.svg';
import brushSvg from '../svg/select-brush.svg';
import cropSvg from '../svg/crop.svg';
import frameSelectionSvg from '../svg/frame-selection.svg';
import showHideSelectionSvg from '../svg/show-hide-selection.svg';

class BottomToolbar extends Container {
    constructor(events: Events, args = {}) {
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

        const createSvg = (svgString: string) => {
            const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
            return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
        };

        const undo = new Button({
            id: 'bottom-toolbar-undo',
            class: 'bottom-toolbar-button'
        });

        const redo = new Button({
            id: 'bottom-toolbar-redo',
            class: 'bottom-toolbar-button',
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

        const frame = new Button({
            id: 'bottom-toolbar-frame',
            class: 'bottom-toolbar-button'
        });

        const showHide = new Button({
            id: 'bottom-toolbar-show-hide',
            class: ['bottom-toolbar-tool', 'active']
        });

        undo.dom.appendChild(createSvg(undoSvg));
        redo.dom.appendChild(createSvg(redoSvg));
        picker.dom.appendChild(createSvg(pickerSvg));
        brush.dom.appendChild(createSvg(brushSvg));
        lasso.dom.appendChild(createSvg(lassoSvg));
        crop.dom.appendChild(createSvg(cropSvg));
        frame.dom.appendChild(createSvg(frameSelectionSvg));
        showHide.dom.appendChild(createSvg(showHideSelectionSvg));

        this.append(undo);
        this.append(redo);
        this.append(new Element({ class: 'bottom-toolbar-separator' }));
        this.append(picker);
        this.append(brush);
        this.append(lasso);
        this.append(crop);
        this.append(new Element({ class: 'bottom-toolbar-separator' }));
        this.append(frame);
        this.append(showHide);

        undo.dom.addEventListener('click', () => {
            events.fire('edit.undo');
        });

        redo.dom.addEventListener('click', () => {
            events.fire('edit.redo');
        });

        picker.dom.addEventListener('click', () => {
            events.fire('tool.rectSelection');
        });

        brush.dom.addEventListener('click', () => {
            events.fire('tool.brushSelection');
        });

        frame.dom.addEventListener('click', () => {
            events.fire('camera.focus');
        });

        let splatSizeSave = 2;
        events.on('splatSize', (size: number) => {
            if (size !== 0) {
                splatSizeSave = size;
            }
            showHide.class[size === 0 ? 'remove' : 'add']('active');
        });

        showHide.dom.addEventListener('click', () => {
            events.fire('splatSize', events.invoke('splatSize') === 0 ? splatSizeSave : 0);
        });

        events.on('tool.activated', (toolName: string) => {
            picker.class[toolName === 'rectSelection' ? 'add' : 'remove']('active');
            brush.class[toolName === 'brushSelection' ? 'add' : 'remove']('active');
        });
    }
}

export { BottomToolbar };
