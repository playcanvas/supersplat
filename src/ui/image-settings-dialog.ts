import { BooleanInput, Button, Container, Element, Label, NumericInput, SelectInput } from 'pcui';

import { Events } from '../events';
import { ImageSettings, VideoSettings } from '../render';
import { localize } from './localization';
import sceneExport from './svg/export.svg';

const createSvg = (svgString: string, args = {}) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new Element({
        dom: new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement,
        ...args
    });
};

class ImageSettingsDialog extends Container {
    show: () => Promise<ImageSettings | null>;
    hide: () => void;
    destroy: () => void;

    constructor(events: Events, args = {}) {
        args = {
            ...args,
            id: 'image-settings-dialog',
            class: 'settings-dialog',
            hidden: true,
            tabIndex: -1
        };

        super(args);

        const dialog = new Container({
            id: 'dialog'
        });

        // header

        const headerIcon = createSvg(sceneExport, { id: 'icon' });
        const headerText = new Label({ id: 'text', text: localize('image.header') });
        const header = new Container({ id: 'header' });
        header.append(headerIcon);
        header.append(headerText);

        // resolution

        const resolutionLabel = new Label({ class: 'label', text: localize('image.resolution') });
        const resolutionSelect = new SelectInput({
            class: 'select',
            defaultValue: 'viewport',
            options: [
                { v: 'viewport', t: localize('image.resolutionViewport') },
                { v: '1080', t: '1920x1080' },
                { v: '4k', t: '3840x2160' },
                { v: 'custom', t: localize('image.resolutionCustom') }
            ]
        });
        const resolutionRow = new Container({ class: 'row' });
        resolutionRow.append(resolutionLabel);
        resolutionRow.append(resolutionSelect);


        // custom resolution background

        const customResolutionLabel = new Label({ class: 'label', text: localize('image.customResolution') });
        const customResolutionWidth = new NumericInput({
            class: 'custom-width',
            precision: 0,
            value: 1024,
            min: 320,
            max: 16000
        });
        const customResolutionHeight = new NumericInput({
            class: 'custom-height',
            precision: 0,
            value: 768,
            min: 240,
            max: 12000
        });
        const customResolutionRow = new Container({ class: 'row', enabled: false });
        customResolutionRow.append(customResolutionLabel);
        customResolutionRow.append(customResolutionWidth);
        customResolutionRow.append(customResolutionHeight);

        // transparent background

        const transparentBgLabel = new Label({ class: 'label', text: localize('image.transparentBg') });
        const transparentBgBoolean = new BooleanInput({ class: 'boolean', value: false });
        const transparentBgRow = new Container({ class: 'row' });
        transparentBgRow.append(transparentBgLabel);
        transparentBgRow.append(transparentBgBoolean);

        // show debug overlays

        const showDebugLabel = new Label({ class: 'label', text: localize('image.showDebug') });
        const showDebugBoolean = new BooleanInput({ class: 'boolean', value: false });
        const showDebugRow = new Container({ class: 'row' });
        showDebugRow.append(showDebugLabel);
        showDebugRow.append(showDebugBoolean);

        // content

        const content = new Container({ id: 'content' });
        content.append(resolutionRow);
        content.append(customResolutionRow);
        content.append(transparentBgRow);
        content.append(showDebugRow);

        // footer

        const footer = new Container({ id: 'footer' });

        const cancelButton = new Button({
            class: 'button',
            text: localize('render.cancel')
        });

        const okButton = new Button({
            class: 'button',
            text: localize('render.ok')
        });

        footer.append(cancelButton);
        footer.append(okButton);

        dialog.append(header);
        dialog.append(content);
        dialog.append(footer);

        this.append(dialog);

        // Handle custom resolution activation

        resolutionSelect.on('change', () => {
            customResolutionRow.enabled = resolutionSelect.value === 'custom';
        });

        // handle key bindings for enter and escape

        let onCancel: () => void;
        let onOK: () => void;

        cancelButton.on('click', () => onCancel());
        okButton.on('click', () => onOK());

        const keydown = (e: KeyboardEvent) => {
            switch (e.key) {
                case 'Escape':
                    onCancel();
                    break;
                case 'Enter':
                    if (!e.shiftKey) onOK();
                    break;
                default:
                    e.stopPropagation();
                    break;
            }
        };

        // reset UI and configure for current state
        const reset = () => {

        };

        // function implementations

        this.show = () => {
            reset();

            this.hidden = false;
            this.dom.addEventListener('keydown', keydown);
            this.dom.focus();

            return new Promise<ImageSettings | null>((resolve) => {
                onCancel = () => {
                    resolve(null);
                };

                onOK = () => {

                    const widths: Record<string, number> = {
                        '1080': 1920,
                        '4k': 3840
                    };

                    const heights: Record<string, number> = {
                        '1080': 1080,
                        '4k': 2160
                    };

                    const width = widths[resolutionSelect.value] ?? customResolutionWidth.value;
                    const height = heights[resolutionSelect.value] ?? customResolutionHeight.value;

                    const imageSettings = {
                        width,
                        height,
                        transparentBg: transparentBgBoolean.value,
                        showDebug: showDebugBoolean.value,
                        useViewportSize: resolutionSelect.value === 'viewport'
                    };

                    resolve(imageSettings);
                };
            }).finally(() => {
                this.dom.removeEventListener('keydown', keydown);
                this.hide();
            });
        };

        this.hide = () => {
            this.hidden = true;
        };

        this.destroy = () => {
            this.hide();
            super.destroy();
        };
    }
}

export { ImageSettingsDialog };
