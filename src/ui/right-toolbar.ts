import { Button, Container, Element } from 'pcui';
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

        this.dom.addEventListener('pointerdown', (event) => {
            event.stopPropagation();
        });

        const showHideSplats = new Button({
            id: 'right-toolbar-show-hide',
            class: ['right-toolbar-toggle', 'active']
        });

        const frameSelection = new Button({
            id: 'right-toolbar-frame-selection',
            class: 'right-toolbar-button'
        });

        const options = new Button({
            id: 'right-toolbar-options',
            class: 'right-toolbar-toggle',
            icon: 'E283'
        });

        showHideSplats.dom.appendChild(createSvg(showHideSplatsSvg));
        frameSelection.dom.appendChild(createSvg(frameSelectionSvg));

        this.append(showHideSplats);
        this.append(frameSelection);
        this.append(new Element({ class: 'right-toolbar-separator' }));
        this.append(options);

        tooltips.register(showHideSplats, 'Show/Hide Splats ( Space )', 'left');
        tooltips.register(frameSelection, 'Frame Selection ( F )', 'left');
        tooltips.register(options, 'View Options', 'left');

        // add event handlers

        options.on('click', () => events.fire('viewPanel.toggleVisible'));
        frameSelection.on('click', () => events.fire('camera.focus'));

        events.on('viewPanel.visible', (visible: boolean) => {
            options.class[visible ? 'add' : 'remove']('active');
        });

        // show-hide splats

        events.on('camera.debug', (debug: boolean) => {
            showHideSplats.dom.classList[debug ? 'add' : 'remove']('active');
        });

        showHideSplats.dom.addEventListener('click', () => {
            events.fire('camera.toggleDebug');
        });
    }
}

export { RightToolbar };
