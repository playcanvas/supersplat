import { Button, ColorPicker, Container, Element, Label, SelectInput, SliderInput, TextInput, BooleanInput } from 'pcui';
import { path } from 'playcanvas';

import { Pose } from '../camera-poses';
import { localize } from './localization';
import { Events } from '../events';
import { UISceneWriteOptions } from '../file-handler';
import { AnimTrack, ExperienceSettings } from '../splat-serialize';
import sceneExport from './svg/export.svg';

const createSvg = (svgString: string, args = {}) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new Element({
        dom: new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement,
        ...args
    });
};

class ExportPopup extends Container {
    show: (splatNames: [string], filename?: string) => void;
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

        // UI

        const dialog = new Container({
            id: 'dialog'
        });

        // header

        const header = new Container({
            id: 'header'
        });

        const headerText = new Label({
            id: 'header',
            text: localize('export.header')
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
            defaultValue: 'ply',
            options: [
                { v: 'ply', t: localize('export.ply') },
                { v: 'splat', t: localize('export.splat') },
                { v: 'html', t: localize('export.viewer-html') },
                { v: 'zip', t: localize('export.viewer-zip') }
            ]
        });

        typeRow.append(typeLabel);
        typeRow.append(typeSelect);

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

        // splats

        const splatsRow = new Container({
            class: 'row'
        });

        const splatsLabel = new Label({
            class: 'label',
            text: localize('export.splats-select')
        });

        const splatsSelect = new SelectInput({
            class: 'select',
            defaultValue: 'ply',
            options: [
                { v: 'all', t: localize('export.splats-select.all') }
            ]
        });

        splatsRow.append(splatsLabel);
        splatsRow.append(splatsSelect);

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
            value: 3
        });

        bandsRow.append(bandsLabel);
        bandsRow.append(bandsSlider);

        // ply: compress or not

        const compressRow = new Container({
            class: 'row'
        });

        const compressLabel = new Label({
            class: 'label',
            text: localize('export.ply-compress')
        });

        const compressBoolean = new BooleanInput({
            class: 'boolean',
            type: 'toggle'
        });

        compressRow.append(compressLabel);
        compressRow.append(compressBoolean);

        // viewer: camera start position

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

        // viewer: animation

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

        // viewer: clear color

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

        // viewer: fov

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

        // content

        const plyRows = [compressRow];
        const viewerRows = [startRow, animationRow, colorRow, fovRow];
        const specialRows = [...plyRows, ...viewerRows];

        content.append(typeRow);
        content.append(filenameRow);
        content.append(splatsRow);
        content.append(bandsRow);
        plyRows.forEach(r => content.append(r));
        viewerRows.forEach(r => content.append(r));

        // ply default
        specialRows.forEach((r) => {
            r.hidden = true;
        });
        plyRows.forEach((r) => {
            r.hidden = false;
        });


        // footer

        const footer = new Container({ id: 'footer' });

        const cancelButton = new Button({
            class: 'button',
            text: localize('popup.cancel')
        });

        const exportButton = new Button({
            class: 'button',
            text: localize('file.export')
        });

        footer.append(cancelButton);
        footer.append(exportButton);

        dialog.append(header);
        dialog.append(content);
        dialog.append(footer);

        this.append(dialog);

        // handler

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
                    if (!e.shiftKey) onExport();
                    break;
                default:
                    e.stopPropagation();
                    break;
            }
        };

        const updateOptions = () => {
            specialRows.forEach((r) => {
                r.hidden = true;
            });
            const activeRows = (() => {
                switch (typeSelect.value) {
                    case 'ply': return plyRows;
                    case 'splat': return [];
                    case 'html': return viewerRows;
                    case 'zip': return viewerRows;
                    // should not happen
                    default: throw new Error(`Unsupported type for specific options query ${typeSelect.value}`);
                }
            })();
            activeRows.forEach((r) => {
                r.hidden = false;
            });
        };

        typeSelect.on('change', updateOptions);

        const updateExtension = () => {
            if (!filenameRow.hidden) {
                const removeExtension = (filename: string) => {
                    let suffixLength;
                    if (filename.endsWith('-viewer.html')) {
                        suffixLength = '-viewer.html'.length;
                    } else if (filename.endsWith('-viewer.zip')) {
                        suffixLength = '-viewer.zip'.length;
                    } else {
                        suffixLength = path.getExtension(filename).length;
                    }
                    return filename.substring(0, filename.length - suffixLength);
                };
                const extension = (() => {
                    switch (typeSelect.value) {
                        case 'ply': return compressBoolean.value ? '.compressed.ply' : '.ply';
                        case 'splat': return '.splat';
                        case 'html': return '-viewer.html';
                        case 'zip': return '-viewer.zip';
                        // should not happen
                        default: throw new Error(`Unsupported type for extension query ${typeSelect.value}`);
                    }
                })();
                filenameEntry.value = removeExtension(filenameEntry.value) + extension;
            }
        };

        typeSelect.on('change', updateExtension);
        compressBoolean.on('change', updateExtension);

        const reset = (splatNames: [string], hasPoses: boolean) => {
            const bgClr = events.invoke('bgClr');

            splatsSelect.value = 'all';
            splatsSelect.options = [
                { v: 'all', t: localize('export.splats-select.all') },
                ...splatNames.map((s, i) => ({ v: i.toString(), t: s }))
            ];
            bandsSlider.value = events.invoke('view.bands');
            // ply
            compressBoolean.value = false;
            // viewer
            startSelect.value = hasPoses ? 'pose' : 'viewport';
            startSelect.disabledOptions = hasPoses ? {} : { 'pose': startSelect.options[2].t };
            animationSelect.value = hasPoses ? 'track' : 'none';
            animationSelect.disabledOptions = hasPoses ? { } : { track: animationSelect.options[1].t };
            colorPicker.value = [bgClr.r, bgClr.g, bgClr.b];
            fovSlider.value = events.invoke('camera.fov');
        };

        this.show = (splatNames: [string], filename?: string) => {
            const frames = events.invoke('timeline.frames');
            const frameRate = events.invoke('timeline.frameRate');

            // get poses
            const orderedPoses = (events.invoke('camera.poses') as Pose[])
            .slice()
            .filter(p => p.frame >= 0 && p.frame < frames)
            .sort((a, b) => a.frame - b.frame);

            reset(splatNames, orderedPoses.length > 0);

            // filename is only shown in safari where file picker is not supported
            filenameRow.hidden = !filename;
            if (filename) {
                filenameEntry.value = filename;
                updateExtension();
            }

            this.hidden = false;
            this.dom.addEventListener('keydown', keydown);
            this.dom.focus();

            const assemblePlyOptions = () : UISceneWriteOptions => {
                return {
                    type: compressBoolean.value ? 'compressed-ply' : 'ply',
                    splatIdx: splatsSelect.value === 'all' ? 'all' : [splatsSelect.value],
                    filename: filename && filenameEntry.value,
                    serializeSettings: {
                        maxSHBands: bandsSlider.value
                    }
                };
            };

            const assembleSplatOptions = () : UISceneWriteOptions => {
                return {
                    type: 'splat',
                    splatIdx: splatsSelect.value === 'all' ? 'all' : [splatsSelect.value],
                    filename: filename && filenameEntry.value,
                    serializeSettings: {
                        maxSHBands: bandsSlider.value
                    }
                };
            };

            const assembleViewerOptions = () : UISceneWriteOptions => {
                // extract camera starting pos
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
                            times.push(p.frame);
                            position.push(p.position.x, p.position.y, p.position.z);
                            target.push(p.target.x, p.target.y, p.target.z);
                        }

                        animTracks.push({
                            name: 'cameraAnim',
                            duration: frames / frameRate,
                            frameRate,
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
                    maxSHBands: bandsSlider.value
                };

                return {
                    type: 'viewer',
                    splatIdx: splatsSelect.value === 'all' ? 'all' : [splatsSelect.value],
                    viewerExportSettings: {
                        type: typeSelect.value,
                        filename: filename && filenameEntry.value,
                        serializeSettings,
                        experienceSettings
                    }
                };
            };

            return new Promise<null | UISceneWriteOptions>((resolve) => {
                onCancel = () => {
                    resolve(null);
                };

                onExport = () => {
                    const settings: UISceneWriteOptions = (() => {
                        switch (typeSelect.value) {
                            case 'ply': return assemblePlyOptions();
                            case 'splat': return assembleSplatOptions();
                            case 'html': // fallthrough
                            case 'zip': return assembleViewerOptions();
                        }
                    })();
                    resolve(settings);
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

export { ExportPopup };
