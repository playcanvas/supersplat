import { Button, Container } from 'pcui';
import { Events } from '../events';
import { Tooltips } from './tooltips';

import showHideSplatsSvg from '../svg/show-hide-splats.svg';
import frameSelectionSvg from '../svg/frame-selection.svg';

const createSvg = (svgString: string) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

class RightToolbar extends Container {
    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'right-toolbar'
        };

        super(args);

        const handleDown = (event: PointerEvent) => {
            event.preventDefault();
            event.stopPropagation();
        };

        this.dom.addEventListener('pointerdown', (event) => {
            handleDown(event);
        });

        const showHide = new Button({
            id: 'right-toolbar-show-hide',
            class: ['right-toolbar-button', 'active']
        });

        const frameSelection = new Button({
            id: 'right-toolbar-frame-selection',
            class: 'right-toolbar-button'
        });

        const options = new Button({
            id: 'right-toolbar-options',
            class: 'right-toolbar-button',
            icon: 'E283'
        });

        const translate = new Button({
            id: 'right-toolbar-translate',
            class: 'right-toolbar-button',
            icon: 'E111'
        });

        const rotate = new Button({
            id: 'right-toolbar-rotate',
            class: 'right-toolbar-button',
            icon: 'E113'
        });

        const scale = new Button({
            id: 'right-toolbar-scale',
            class: 'right-toolbar-button',
            icon: 'E112'
        });

        showHide.dom.appendChild(createSvg(showHideSplatsSvg));
        frameSelection.dom.appendChild(createSvg(frameSelectionSvg));

        this.append(showHide);
        this.append(frameSelection);
        this.append(options);
        this.append(translate);
        this.append(rotate);
        this.append(scale);

        tooltips.register(showHide, 'Show/Hide Splats', 'left');
        tooltips.register(frameSelection, 'Frame Selection', 'left');
        tooltips.register(options, 'Options', 'left');
        tooltips.register(translate, 'Translate', 'left');
        tooltips.register(rotate, 'Rotate', 'left');
        tooltips.register(scale, 'Scale', 'left');

        // add event handlers

        options.on('click', () => events.fire('viewPanel.toggleVisible'));
        frameSelection.on('click', () => events.fire('camera.focus'));
        translate.on('click', () => events.fire('tool.move'));
        rotate.on('click', () => events.fire('tool.rotate'));
        scale.on('click', () => events.fire('tool.scale'));

        events.on('viewPanel.visible', (visible: boolean) => {
            options.class[visible ? 'add' : 'remove']('active');
        });

        events.on('tool.activated', (toolName: string) => {
            translate.class[toolName === 'move' ? 'add' : 'remove']('active');
            rotate.class[toolName === 'rotate' ? 'add' : 'remove']('active');
            scale.class[toolName === 'scale' ? 'add' : 'remove']('active');
        });

        // show-hide splats

        events.on('camera.debug', (debug: boolean) => {
            showHide.class[debug ? 'add' : 'remove']('active');
        });

        showHide.dom.addEventListener('click', () => {
            events.fire('camera.toggleDebug');
        });
    }
};

export { RightToolbar };
