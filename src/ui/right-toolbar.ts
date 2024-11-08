import { Button, Container, Element, Label } from 'pcui';
import { Events } from '../events';
import { Tooltips } from './tooltips';
import { localize } from './localization';

import showHideSplatsSvg from './svg/show-hide-splats.svg';
import cameraFrameSelectionSvg from './svg/camera-frame-selection.svg';
import cameraResetSvg from './svg/camera-reset.svg';
import cameraPanelSvg from './svg/camera-panel.svg';
import colorPanelSvg from './svg/color-panel.svg';
import centersSvg from './svg/centers.svg';
import ringsSvg from './svg/rings.svg';

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

        const ringsModeToggle = new Button({
            id: 'right-toolbar-mode-toggle',
            class: 'right-toolbar-toggle'
        });

        const showHideSplats = new Button({
            id: 'right-toolbar-show-hide',
            class: ['right-toolbar-toggle', 'active']
        });

        const cameraFrameSelection = new Button({
            id: 'right-toolbar-frame-selection',
            class: 'right-toolbar-button'
        });

        const cameraReset = new Button({
            id: 'right-toolbar-camera-origin',
            class: 'right-toolbar-button'
        });

        const cameraPanel = new Button({
            id: 'right-toolbar-camera-panel',
            class: 'right-toolbar-toggle',
        });

        const colorPanel = new Button({
            id: 'right-toolbar-color-panel',
            class: 'right-toolbar-toggle',
        });

        const options = new Button({
            id: 'right-toolbar-options',
            class: 'right-toolbar-toggle',
            icon: 'E283'
        });

        const centersDom = createSvg(centersSvg);
        const ringsDom = createSvg(ringsSvg);
        ringsDom.style.display = 'none';

        ringsModeToggle.dom.appendChild(centersDom);
        ringsModeToggle.dom.appendChild(ringsDom);
        showHideSplats.dom.appendChild(createSvg(showHideSplatsSvg));
        cameraFrameSelection.dom.appendChild(createSvg(cameraFrameSelectionSvg));
        cameraReset.dom.appendChild(createSvg(cameraResetSvg));
        cameraPanel.dom.appendChild(createSvg(cameraPanelSvg));
        colorPanel.dom.appendChild(createSvg(colorPanelSvg));

        this.append(ringsModeToggle);
        this.append(showHideSplats);
        this.append(new Element({ class: 'right-toolbar-separator' }));
        this.append(cameraFrameSelection);
        this.append(cameraReset);
        this.append(cameraPanel);
        this.append(colorPanel);
        this.append(new Element({ class: 'right-toolbar-separator' }));
        this.append(options);

        tooltips.register(ringsModeToggle, localize('tooltip.splat-mode'), 'left');
        tooltips.register(showHideSplats, localize('tooltip.show-hide'), 'left');
        tooltips.register(cameraFrameSelection, localize('tooltip.frame-selection'), 'left');
        tooltips.register(cameraReset, localize('tooltip.camera-reset'), 'left');
        tooltips.register(options, localize('tooltip.view-options'), 'left');

        // add event handlers

        ringsModeToggle.on('click', () => {
            events.fire('camera.toggleMode');
            events.fire('camera.setOverlay', true);
        });
        showHideSplats.on('click', () => events.fire('camera.toggleOverlay'));
        cameraFrameSelection.on('click', () => events.fire('camera.focus'));
        cameraReset.on('click', () => events.fire('camera.reset'));
        cameraPanel.on('click', () => events.fire('cameraPanel.toggleVisible'));
        colorPanel.on('click', () => events.fire('colorPanel.toggleVisible'));
        options.on('click', () => events.fire('viewPanel.toggleVisible'));

        events.on('camera.mode', (mode: string) => {
            ringsModeToggle.class[mode === 'rings' ? 'add' : 'remove']('active');
            centersDom.style.display = mode === 'rings' ? 'none' : 'block';
            ringsDom.style.display = mode === 'rings' ? 'block' : 'none';
        });

        events.on('camera.overlay', (value: boolean) => {
            showHideSplats.class[value ? 'add' : 'remove']('active');
        });

        events.on('cameraPanel.visible', (visible: boolean) => {
            cameraPanel.class[visible ? 'add' : 'remove']('active');
        });

        events.on('colorPanel.visible', (visible: boolean) => {
            colorPanel.class[visible ? 'add' : 'remove']('active');
        });

        events.on('viewPanel.visible', (visible: boolean) => {
            options.class[visible ? 'add' : 'remove']('active');
        });
    }
}

export { RightToolbar };
