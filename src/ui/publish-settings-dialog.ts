import { BooleanInput, Button, ColorPicker, Container, Element, Label, SelectInput, SliderInput, TextAreaInput, TextInput } from 'pcui';

import { Pose } from '../camera-poses';
import { Events } from '../events';
import { localize } from './localization';
import { PublishSettings } from '../publish';
import { AnimTrack, ExperienceSettings } from '../splat-serialize';
import sceneExport from './svg/export.svg';

const createSvg = (svgString: string, args = {}) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new Element({
        dom: new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement,
        ...args
    });
};

class PublishSettingsDialog extends Container {
    show: () => Promise<PublishSettings | null>;
    hide: () => void;
    destroy: () => void;

    constructor(events: Events, args = {}) {
        args = {
            ...args,
            id: 'publish-settings-dialog',
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
        const headerText = new Label({ id: 'text', text: localize('publish.header') });
        const header = new Container({ id: 'header' });
        header.append(headerIcon);
        header.append(headerText);

        // title

        const titleLabel = new Label({ class: 'label', text: localize('publish.title') });
        const titleInput = new TextInput({ class: 'text-input' });
        const titleRow = new Container({ class: 'row' });
        titleRow.append(titleLabel);
        titleRow.append(titleInput);

        // description

        const descLabel = new Label({ class: 'label', text: localize('publish.description') });
        const descInput = new TextAreaInput({ class: 'text-area' });
        const descRow = new Container({ class: 'row' });
        descRow.append(descLabel);
        descRow.append(descInput);

        // listed

        const listLabel = new Label({ class: 'label', text: localize('publish.listed') });
        const listBoolean = new BooleanInput({ class: 'boolean', value: true });
        const listRow = new Container({ class: 'row' });
        listRow.append(listLabel);
        listRow.append(listBoolean);

        // start position

        const startLabel = new Label({ class: 'label', text: localize('export.start-position') });
        const startSelect = new SelectInput({
            class: 'select',
            defaultValue: 'viewport',
            options: [
                { v: 'default', t: localize('export.default') },
                { v: 'viewport', t: localize('export.viewport') },
                { v: 'pose', t: localize('export.pose-camera') }
            ]
        });
        const startRow = new Container({ class: 'row' });
        startRow.append(startLabel);
        startRow.append(startSelect);

        // animation

        const animationLabel = new Label({ class: 'label', text: localize('export.animation') });
        const animationSelect = new SelectInput({
            class: 'select',
            defaultValue: 'none',
            options: [
                { v: 'none', t: localize('export.animation-none') },
                { v: 'track', t: localize('export.animation-track') }
            ]
        });
        const animationRow = new Container({ class: 'row' });
        animationRow.append(animationLabel);
        animationRow.append(animationSelect);

        // clear color

        const colorLabel = new Label({ class: 'label', text: localize('export.background-color') });
        const colorPicker = new ColorPicker({
            class: 'color-picker',
            value: [1, 1, 1, 1]
        });
        const colorRow = new Container({ class: 'row' });
        colorRow.append(colorLabel);
        colorRow.append(colorPicker);

        // fov

        const fovLabel = new Label({ class: 'label', text: localize('export.fov') });
        const fovSlider = new SliderInput({
            class: 'slider',
            min: 10,
            max: 120,
            precision: 0,
            value: 60
        });
        const fovRow = new Container({ class: 'row' });
        fovRow.append(fovLabel);
        fovRow.append(fovSlider);

        // bands

        const bandsLabel = new Label({ class: 'label', text: localize('export.sh-bands') });
        const bandsSlider = new SliderInput({
            class: 'slider',
            min: 0,
            max: 3,
            precision: 0,
            value: 3
        });
        const bandsRow = new Container({ class: 'row' });
        bandsRow.append(bandsLabel);
        bandsRow.append(bandsSlider);

        // content

        const content = new Container({ id: 'content' });
        content.append(titleRow);
        content.append(descRow);
        content.append(listRow);
        content.append(startRow);
        content.append(animationRow);
        content.append(colorRow);
        content.append(fovRow);
        content.append(bandsRow);

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
            const splats = events.invoke('scene.splats');
            const filename = splats[0].filename;
            const dot = splats[0].filename.lastIndexOf('.');

            const hasPoses = events.invoke('camera.poses').length > 0;
            const bgClr = events.invoke('bgClr');

            titleInput.value = filename.slice(0, dot > 0 ? dot : undefined);
            descInput.value = '';
            listBoolean.value = true;
            startSelect.value = hasPoses ? 'pose' : 'viewport';
            startSelect.disabledOptions = hasPoses ? { } : { pose: startSelect.options[2].t };
            animationSelect.value = hasPoses ? 'track' : 'none';
            animationSelect.disabledOptions = hasPoses ? { } : { track: animationSelect.options[1].t };
            colorPicker.value = [bgClr.r, bgClr.g, bgClr.b];
            fovSlider.value = events.invoke('camera.fov');
            bandsSlider.value = events.invoke('view.bands');
        };

        // function implementations

        this.show = () => {
            // check user is logged in
            reset();

            this.hidden = false;
            this.dom.addEventListener('keydown', keydown);
            this.dom.focus();

            return new Promise<PublishSettings>((resolve) => {
                onCancel = () => {
                    resolve(null);
                };

                onOK = () => {
                    const frames = events.invoke('timeline.frames');
                    const frameRate = events.invoke('timeline.frameRate');

                    // get poses
                    const orderedPoses = (events.invoke('camera.poses') as Pose[])
                    .slice()
                    .filter(p => p.frame >= 0 && p.frame < frames)
                    .sort((a, b) => a.frame - b.frame);

                    // extract camera starting position
                    let pose;
                    switch (startSelect.value) {
                        case 'pose':
                            pose = orderedPoses?.[0];
                            break;
                        case 'viewport':
                            pose = events.invoke('camera.getPose');
                            break;
                    }
                    const p = pose?.position;
                    const t = pose?.target;

                    const startAnim = (() => {
                        switch (animationSelect.value) {
                            case 'none': return 'none';
                            case 'track': return 'animTrack';
                        }
                    })();

                    // extract camera animation
                    const animTracks: AnimTrack[] = [];
                    switch (startAnim) {
                        case 'none':
                            break;
                        case 'animTrack': {
                            // use camera poses
                            const times = [];
                            const position = [];
                            const target = [];
                            for (let i = 0; i < orderedPoses.length; ++i) {
                                const p = orderedPoses[i];
                                times.push(p.frame / frameRate);
                                position.push(p.position.x, p.position.y, p.position.z);
                                target.push(p.target.x, p.target.y, p.target.z);
                            }

                            animTracks.push({
                                name: 'cameraAnim',
                                duration: frames / frameRate,
                                target: 'camera',
                                loopMode: 'repeat',
                                interpolation: 'spline',
                                keyframes: {
                                    times,
                                    values: { position, target }
                                }
                            });

                            break;
                        }
                    }

                    // build experience details
                    const experienceSettings: ExperienceSettings = {
                        camera: {
                            fov: fovSlider.value,
                            position: p ? [p.x, p.y, p.z] : null,
                            target: t ? [t.x, t.y, t.z] : null,
                            startAnim,
                            animTrack: startAnim === 'animTrack' ? 'cameraAnim' : null
                        },
                        background: {
                            color: colorPicker.value.slice()
                        },
                        animTracks
                    };

                    const serializeSettings = {
                        maxSHBands: bandsSlider.value,
                        minOpacity: 1 / 255,                    // remove completely semitransparent splats
                        removeInvalid: true                     // remove gaussians with any NaN data
                    };

                    resolve({
                        title: titleInput.value,
                        description: descInput.value,
                        listed: listBoolean.value,
                        serializeSettings,
                        experienceSettings
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

export { PublishSettingsDialog };
