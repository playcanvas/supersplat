import { BooleanInput, Button, Container, Element, Label, SelectInput } from 'pcui';

import { Events } from '../events';
import { VideoSettings } from '../render';
import { localize } from './localization';
import sceneExport from './svg/export.svg';

const createSvg = (svgString: string, args = {}) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new Element({
        dom: new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement,
        ...args
    });
};

class VideoSettingsDialog extends Container {
    show: () => Promise<VideoSettings | null>;
    hide: () => void;
    destroy: () => void;

    constructor(events: Events, args = {}) {
        args = {
            ...args,
            id: 'video-settings-dialog',
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
        const headerText = new Label({ id: 'text', text: localize('video.header') });
        const header = new Container({ id: 'header' });
        header.append(headerIcon);
        header.append(headerText);

        // resolution

        const resolutionLabel = new Label({ class: 'label', text: localize('video.resolution') });
        const resolutionSelect = new SelectInput({
            class: 'select',
            defaultValue: '1080',
            options: [
                { v: '540', t: '960x540' },
                { v: '720', t: '1280x720' },
                { v: '1080', t: '1920x1080' },
                { v: '1440', t: '2560x1440' },
                { v: '4k', t: '3840x2160' }
            ]
        });
        const resolutionRow = new Container({ class: 'row' });
        resolutionRow.append(resolutionLabel);
        resolutionRow.append(resolutionSelect);

        // bitrate

        const bitrateLabel = new Label({ class: 'label', text: localize('video.bitrate') });
        const bitrateSelect = new SelectInput({
            class: 'select',
            defaultValue: '5',
            options: [
                { v: '2', t: '2mbps' },
                { v: '5', t: '5mbps' },
                { v: '8', t: '8mbps' },
                { v: '16', t: '16mbps' }
            ]
        });
        const bitrateRow = new Container({ class: 'row' });
        bitrateRow.append(bitrateLabel);
        bitrateRow.append(bitrateSelect);

        // portrait mode

        const portraitLabel = new Label({ class: 'label', text: localize('video.portrait') });
        const portraitBoolean = new BooleanInput({ class: 'boolean', value: false });
        const portraitRow = new Container({ class: 'row' });
        portraitRow.append(portraitLabel);
        portraitRow.append(portraitBoolean);

        // transparent background

        const transparentBgLabel = new Label({ class: 'label', text: localize('video.transparentBg') });
        const transparentBgBoolean = new BooleanInput({ class: 'boolean', value: false });
        const transparentBgRow = new Container({ class: 'row' });
        transparentBgRow.append(transparentBgLabel);
        transparentBgRow.append(transparentBgBoolean);

        // hide transparent background till we add support for webm
        // video container
        transparentBgRow.hidden = true;

        // show debug overlays

        const showDebugLabel = new Label({ class: 'label', text: localize('video.showDebug') });
        const showDebugBoolean = new BooleanInput({ class: 'boolean', value: false });
        const showDebugRow = new Container({ class: 'row' });
        showDebugRow.append(showDebugLabel);
        showDebugRow.append(showDebugBoolean);

        // content

        const content = new Container({ id: 'content' });
        content.append(resolutionRow);
        content.append(bitrateRow);
        content.append(portraitRow);
        content.append(transparentBgRow);
        content.append(showDebugRow);

        // footer

        const footer = new Container({ id: 'footer' });

        const cancelButton = new Button({
            class: 'button',
            text: localize('publish.cancel')
        });

        const okButton = new Button({
            class: 'button',
            text: localize('publish.ok')
        });

        footer.append(cancelButton);
        footer.append(okButton);

        dialog.append(header);
        dialog.append(content);
        dialog.append(footer);

        this.append(dialog);

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

            return new Promise<VideoSettings | null>((resolve) => {
                onCancel = () => {
                    resolve(null);
                };

                onOK = () => {

                    const widths: Record<string, number> = {
                        '540': 960,
                        '720': 1280,
                        '1080': 1920,
                        '1440': 2560,
                        '4k': 3840
                    };

                    const heights: Record<string, number> = {
                        '540': 540,
                        '720': 720,
                        '1080': 1080,
                        '1440': 1440,
                        '4k': 2160
                    };

                    const portrait = portraitBoolean.value;

                    const videoSettings = {
                        startFrame: 0,
                        endFrame: events.invoke('timeline.frames') - 1,
                        frameRate: events.invoke('timeline.frameRate'),
                        width: (portrait ? heights : widths)[resolutionSelect.value],
                        height: (portrait ? widths : heights)[resolutionSelect.value],
                        bitrate: parseInt(bitrateSelect.value, 10) * 1e8,
                        transparentBg: transparentBgBoolean.value,
                        showDebug: showDebugBoolean.value
                    };

                    resolve(videoSettings);
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

export { VideoSettingsDialog };
