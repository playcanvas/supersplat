import { Button, ColorPicker, Container, Element, Label, SelectInput, SliderInput, TextInput } from 'pcui';
import { path } from 'playcanvas';

import { localize } from './localization';
import { Events } from '../events';
import { ViewerExportOptions } from '../splat-serialize';
import sceneExport from './svg/export.svg';

const createSvg = (svgString: string, args = {}) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new Element({
        dom: new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement,
        ...args
    });
};

class ViewerExportPopup extends Container {
    show: (filename?: string) => void;
    hide: () => void;
    destroy: () => void;

    constructor(events: Events, args = {}) {
        args = {
            id: 'export-popup',
            hidden: true,
            tabIndex: -1,
            ...args
        };

        super(args);

        const dialog = new Container({
            id: 'dialog'
        });

        // header

        const header = new Container({
            id: 'header'
        });

        const headerText = new Label({
            id: 'header',
            text: 'VIEWER EXPORT'
        });

        header.append(createSvg(sceneExport, {
            id: 'icon'
        }));
        header.append(headerText);

        // content

        const content = new Container({ id: 'content' });

        // type

        const typeRow = new Container({
            class: 'row'
        });

        const typeLabel = new Label({
            class: 'label',
            text: localize('export.type')
        });

        const typeSelect = new SelectInput({
            class: 'select',
            defaultValue: 'html',
            options: [
                { v: 'html', t: localize('export.html') },
                { v: 'zip', t: localize('export.package') }
            ]
        });

        typeRow.append(typeLabel);
        typeRow.append(typeSelect);

        // spherical harmonic bands

        const bandsRow = new Container({
            class: 'row'
        });

        const bandsLabel = new Label({
            class: 'label',
            text: localize('export.sh-bands')
        });

        const bandsSlider = new SliderInput({
            class: 'slider',
            min: 0,
            max: 3,
            precision: 0,
            value: 2
        });

        bandsRow.append(bandsLabel);
        bandsRow.append(bandsSlider);

        // camera start position

        const startRow = new Container({
            class: 'row'
        });

        const startLabel = new Label({
            class: 'label',
            text: localize('export.start-position')
        });

        const startSelect = new SelectInput({
            class: 'select',
            defaultValue: 'viewport',
            options: [
                { v: 'default', t: localize('export.default') },
                { v: 'viewport', t: localize('export.viewport') },
                { v: 'pose', t: localize('export.pose-camera') }
            ]
        });

        startRow.append(startLabel);
        startRow.append(startSelect);

        // clear color

        const colorRow = new Container({
            class: 'row'
        });

        const colorLabel = new Label({
            class: 'label',
            text: localize('export.background-color')
        });

        const colorPicker = new ColorPicker({
            class: 'color-picker',
            value: [1, 1, 1, 1]
        });

        colorRow.append(colorLabel);
        colorRow.append(colorPicker);

        // fov

        const fovRow = new Container({
            class: 'row'
        });

        const fovLabel = new Label({
            class: 'label',
            text: localize('export.fov')
        });

        const fovSlider = new SliderInput({
            class: 'slider',
            min: 10,
            max: 120,
            precision: 0,
            value: 60
        });

        fovRow.append(fovLabel);
        fovRow.append(fovSlider);

        // filename

        const filenameRow = new Container({
            class: 'row'
        });

        const filenameLabel = new Label({
            class: 'label',
            text: localize('export.filename')
        });

        const filenameEntry = new TextInput({
            class: 'text-input'
        });

        filenameRow.append(filenameLabel);
        filenameRow.append(filenameEntry);

        // content

        content.append(typeRow);
        content.append(bandsRow);
        content.append(startRow);
        content.append(colorRow);
        content.append(fovRow);
        content.append(filenameRow);

        // footer

        const footer = new Container({ id: 'footer' });

        const cancelButton = new Button({
            class: 'button',
            text: localize('popup.cancel')
        });

        const exportButton = new Button({
            class: 'button',
            text: localize('scene.export')
        });

        footer.append(cancelButton);
        footer.append(exportButton);

        dialog.append(header);
        dialog.append(content);
        dialog.append(footer);

        this.append(dialog);

        let onCancel: () => void;
        let onExport: () => void;

        cancelButton.on('click', () => onCancel());
        exportButton.on('click', () => onExport());

        const keydown = (e: KeyboardEvent) => {
            switch (e.key) {
                case 'Escape':
                    onCancel();
                    break;
                case 'Enter':
                    onExport();
                    break;
                default:
                    e.stopPropagation();
                    break;
            }
        };

        const updateExtension = () => {
            if (!filenameRow.hidden) {
                const removeExtension = (filename: string) => {
                    return filename.substring(0, filename.length - path.getExtension(filename).length);
                };
                filenameEntry.value = removeExtension(filenameEntry.value) + (typeSelect.value === 'html' ? '.html' : '.zip');
            }
        };

        typeSelect.on('change', updateExtension);

        let firstTime = true;

        this.show = (filename?: string) => {
            // populate values from the current state first time popup is shown
            if (firstTime) {
                firstTime = false;

                const hasPoses = events.invoke('camera.poses').length > 0;

                // disable the pose option if there are no poses
                startSelect.disabledOptions = hasPoses ? {} : {
                    'pose': startSelect.options[2].t
                };

                // FIXME: might be better for caller to pass these in
                const bgClr = events.invoke('bgClr');
                bandsSlider.value = events.invoke('view.bands');
                startSelect.value = hasPoses ? 'pose' : 'viewport';
                colorPicker.value = [bgClr.r, bgClr.g, bgClr.b];
                fovSlider.value = events.invoke('camera.fov');
            }

            // filename is only shown in safari where file picker is not supported
            filenameRow.hidden = !filename;
            if (filename) {
                filenameEntry.value = filename;
                updateExtension();
            }

            this.hidden = false;
            this.dom.addEventListener('keydown', keydown);
            this.dom.focus();

            return new Promise<null | ViewerExportOptions>((resolve) => {
                onCancel = () => {
                    resolve(null);
                };

                onExport = () => {
                    resolve({
                        type: typeSelect.value,
                        shBands: bandsSlider.value,
                        startPosition: startSelect.value,
                        backgroundColor: colorPicker.value,
                        fov: fovSlider.value,
                        filename: filename && filenameEntry.value
                    });
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

export { ViewerExportPopup };
