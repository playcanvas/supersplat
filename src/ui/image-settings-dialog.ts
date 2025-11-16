import { BooleanInput, Button, Container, Element, Label, NumericInput, SelectInput, VectorInput } from '@playcanvas/pcui';

import { Events } from '../events';
import { ImageSettings } from '../render';
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

        // preset

        const presetLabel = new Label({ class: 'label', text: localize('image.preset') });
        const presetSelect = new SelectInput({
            class: 'select',
            defaultValue: 'viewport',
            options: [
                { v: 'viewport', t: localize('image.resolutionCurrent') },
                { v: 'HD', t: 'HD' },
                { v: 'QHD', t: 'QHD' },
                { v: '4K', t: '4K' },
                { v: 'custom', t: localize('image.resolutionCustom') }
            ]
        });
        const presetRow = new Container({ class: 'row' });
        presetRow.append(presetLabel);
        presetRow.append(presetSelect);

        // resolution

        const resolutionLabel = new Label({ class: 'label', text: localize('image.resolution') });
        const resolutionValue = new VectorInput({
            class: 'vector-input',
            dimensions: 2,
            min: 320,
            max: 16000,
            precision: 0,
            value: [1024, 768]
        });
        const resolutionRow = new Container({ class: 'row', enabled: false });
        resolutionRow.append(resolutionLabel);
        resolutionRow.append(resolutionValue);

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
        content.append(presetRow);
        content.append(resolutionRow);
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

        let targetSize: { width: number, height: number };

        // Handle custom resolution activation

        const updateResolution = () => {
            const widths: Record<string, number> = {
                'viewport': targetSize.width,
                'HD': 1920,
                'QHD': 2560,
                '4K': 3840
            };

            const heights: Record<string, number> = {
                'viewport': targetSize.height,
                'HD': 1080,
                'QHD': 1440,
                '4K': 2160
            };

            resolutionValue.value = [widths[presetSelect.value], heights[presetSelect.value]];
        };

        presetSelect.on('change', () => {
            resolutionRow.enabled = presetSelect.value === 'custom';

            if (presetSelect.value !== 'custom') {
                updateResolution();
            }
        });

        // handle key bindings for enter and escape

        let onCancel: () => void;
        let onOK: () => void;

        cancelButton.on('click', () => onCancel());
        okButton.on('click', () => onOK());

        const keydown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onCancel();
            }
        };

        // reset UI and configure for current state
        const reset = () => {
            updateResolution();
        };

        // function implementations

        this.show = () => {
            targetSize = events.invoke('targetSize');

            reset();

            this.hidden = false;
            document.addEventListener('keydown', keydown);
            this.dom.focus();

            return new Promise<ImageSettings | null>((resolve) => {
                onCancel = () => {
                    resolve(null);
                };

                onOK = () => {
                    const [width, height] = resolutionValue.value;

                    const imageSettings = {
                        width,
                        height,
                        transparentBg: transparentBgBoolean.value,
                        showDebug: showDebugBoolean.value
                    };

                    resolve(imageSettings);
                };
            }).finally(() => {
                document.removeEventListener('keydown', keydown);
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
