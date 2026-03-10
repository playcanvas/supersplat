import { BooleanInput, Button, ColorPicker, Container, Element, Label, SelectInput, SliderInput, TextInput } from '@playcanvas/pcui';

import { Pose } from '../camera-poses';
import { localize } from './localization';
import { Events } from '../events';
import { ExportType, SceneExportOptions } from '../file-handler';
import { AnimTrack, ExperienceSettings, defaultPostEffectSettings } from '../splat-serialize';
import sceneExport from './svg/export.svg';

const createSvg = (svgString: string, args = {}) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new Element({
        dom: new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement,
        ...args
    });
};

const removeKnownExtension = (filename: string) => {
    // remove known extensions (ordered from longest to shortest for compound extensions)
    const knownExtensions = [
        '.compressed.ply',
        '.ksplat',
        '.splat',
        '.html',
        '.ply',
        '.sog',
        '.spz',
        '.lcc',
        '.zip'
    ];

    for (let i = 0; i < knownExtensions.length; ++i) {
        const ext = knownExtensions[i];
        if (filename.endsWith(ext)) {
            return filename.slice(0, -ext.length);
        }
    }

    return filename;
};

class ExportPopup extends Container {
    show: (exportType: ExportType, splatNames: string[], showFilenameEdit: boolean) => Promise<null | SceneExportOptions>;
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
            text: localize('popup.export.header')
        });

        header.append(createSvg(sceneExport, {
            id: 'icon'
        }));

        header.append(headerText);

        // content

        const content = new Container({ id: 'content' });

        // type

        const viewerTypeRow = new Container({
            class: 'row'
        });

        const viewerTypeLabel = new Label({
            class: 'label',
            text: localize('popup.export.type')
        });

        const viewerTypeSelect = new SelectInput({
            class: 'select',
            defaultValue: 'html',
            options: [
                { v: 'html', t: localize('popup.export.html') },
                { v: 'zip', t: localize('popup.export.package') }
            ]
        });

        viewerTypeRow.append(viewerTypeLabel);
        viewerTypeRow.append(viewerTypeSelect);

        // viewer: animation

        const animationLabel = new Label({ class: 'label', text: localize('popup.export.animation') });
        const animationToggle = new BooleanInput({ class: 'boolean', type: 'toggle', value: false });
        const animationRow = new Container({ class: 'row' });
        animationRow.append(animationLabel);
        animationRow.append(animationToggle);

        // viewer: loop mode

        const loopLabel = new Label({ class: 'label', text: localize('popup.export.loop-mode') });
        const loopSelect = new SelectInput({
            class: 'select',
            defaultValue: 'repeat',
            options: [
                { v: 'none', t: localize('popup.export.loop-mode.none') },
                { v: 'repeat', t: localize('popup.export.loop-mode.repeat') },
                { v: 'pingpong', t: localize('popup.export.loop-mode.pingpong') }
            ]
        });
        const loopRow = new Container({ class: 'row' });
        loopRow.append(loopLabel);
        loopRow.append(loopSelect);

        // viewer: clear color

        const colorRow = new Container({
            class: 'row'
        });

        const colorLabel = new Label({
            class: 'label',
            text: localize('popup.export.background-color')
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
            text: localize('popup.export.fov')
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

        // compress

        const compressRow = new Container({
            class: 'row'
        });

        const compressLabel = new Label({
            class: 'label',
            text: localize('popup.export.compress-ply')
        });

        const compressBoolean = new BooleanInput({
            class: 'boolean',
            type: 'toggle'
        });

        compressRow.append(compressLabel);
        compressRow.append(compressBoolean);

        // spherical harmonic bands

        const bandsRow = new Container({
            class: 'row'
        });

        const bandsLabel = new Label({
            class: 'label',
            text: localize('popup.export.sh-bands')
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

        // sog iterations

        const iterationsRow = new Container({
            class: 'row'
        });

        const iterationsLabel = new Label({
            class: 'label',
            text: localize('popup.export.iterations')
        });

        const iterationsSlider = new SliderInput({
            class: 'slider',
            min: 1,
            max: 20,
            precision: 0,
            value: 10
        });

        iterationsRow.append(iterationsLabel);
        iterationsRow.append(iterationsSlider);

        // filename

        const filenameRow = new Container({
            class: 'row'
        });

        const filenameLabel = new Label({
            class: 'label',
            text: localize('popup.export.filename')
        });

        const filenameEntry = new TextInput({
            class: 'text-input'
        });

        filenameRow.append(filenameLabel);
        filenameRow.append(filenameEntry);

        // content

        content.append(viewerTypeRow);
        content.append(animationRow);
        content.append(loopRow);
        content.append(colorRow);
        content.append(fovRow);
        content.append(compressRow);
        content.append(bandsRow);
        content.append(iterationsRow);
        content.append(filenameRow);

        // footer

        const footer = new Container({ id: 'footer' });

        const cancelButton = new Button({
            class: 'button',
            text: localize('popup.cancel')
        });

        const exportButton = new Button({
            class: 'button',
            text: localize('popup.export')
        });

        footer.append(cancelButton);
        footer.append(exportButton);

        dialog.append(header);
        dialog.append(content);
        dialog.append(footer);

        this.append(dialog);

        // handlers

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

        const updateExtension = (ext: string) => {
            filenameEntry.value = removeKnownExtension(filenameEntry.value) + ext;
        };

        compressBoolean.on('change', () => {
            updateExtension(compressBoolean.value ? '.compressed.ply' : '.ply');
        });

        viewerTypeSelect.on('change', () => {
            updateExtension(viewerTypeSelect.value === 'html' ? '.html' : '.zip');
        });

        animationToggle.on('change', (value: boolean) => {
            loopSelect.enabled = value;
        });

        const reset = (exportType: ExportType, splatNames: string[], hasPoses: boolean) => {
            const allRows = [
                viewerTypeRow, animationRow, loopRow, colorRow, fovRow, compressRow, bandsRow, iterationsRow, filenameRow
            ];

            const activeRows = {
                ply: [compressRow, bandsRow, filenameRow],
                splat: [filenameRow],
                sog: [bandsRow, iterationsRow, filenameRow],
                viewer: [viewerTypeRow, animationRow, loopRow, colorRow, fovRow, bandsRow, filenameRow]
            }[exportType];

            allRows.forEach((r) => {
                r.hidden = activeRows.indexOf(r) === -1;
            });

            bandsSlider.value = events.invoke('view.bands');

            // ply
            compressBoolean.value = false;

            // sog
            iterationsSlider.value = 10;

            // filename
            filenameEntry.value = splatNames[0];
            switch (exportType) {
                case 'ply':
                    updateExtension('.ply');
                    break;
                case 'splat':
                    updateExtension('.splat');
                    break;
                case 'sog':
                    updateExtension('.sog');
                    break;
                case 'viewer':
                    updateExtension(viewerTypeSelect.value === 'html' ? '.html' : '.zip');
                    break;
            }

            // viewer
            const bgClr = events.invoke('bgClr');

            animationToggle.value = hasPoses;
            animationToggle.enabled = hasPoses;
            loopSelect.value = 'repeat';
            loopSelect.enabled = hasPoses;

            colorPicker.value = [bgClr.r, bgClr.g, bgClr.b];

            fovSlider.value = events.invoke('camera.fov');
        };

        this.show = (exportType: ExportType, splatNames: string[], showFilenameEdit: boolean) => {
            const frames = events.invoke('timeline.frames');
            const frameRate = events.invoke('timeline.frameRate');
            const smoothness = events.invoke('timeline.smoothness');
            const orderedPoses = (events.invoke('camera.poses') as Pose[])
            .slice()
            .filter(p => p.frame >= 0 && p.frame < frames)
            .sort((a, b) => a.frame - b.frame);

            reset(exportType, splatNames, orderedPoses.length > 0);

            // filename is only shown in safari where file picker is not supported
            filenameRow.hidden = !showFilenameEdit;

            this.hidden = false;
            this.dom.addEventListener('keydown', keydown);
            this.dom.focus();

            const assemblePlyOptions = () : SceneExportOptions => {
                return {
                    filename: filenameEntry.value,
                    splatIdx: 'all',
                    serializeSettings: {
                        maxSHBands: bandsSlider.value
                    },
                    compressedPly: compressBoolean.value
                };
            };

            const assembleSplatOptions = () : SceneExportOptions => {
                return {
                    filename: filenameEntry.value,
                    splatIdx: 'all',
                    serializeSettings: { }
                };
            };

            const assembleSogOptions = () : SceneExportOptions => {
                return {
                    filename: filenameEntry.value,
                    splatIdx: 'all',
                    serializeSettings: {
                        maxSHBands: bandsSlider.value
                    },
                    sogIterations: iterationsSlider.value
                };
            };

            const assembleViewerOptions = () : SceneExportOptions => {
                const fov = fovSlider.value;

                // use current viewport as start pose
                const pose = events.invoke('camera.getPose');
                const p = pose?.position;
                const t = pose?.target;
                const hasStartPose = !!(p && t);

                const cameras = hasStartPose ? [{
                    initial: {
                        position: [p.x, p.y, p.z] as [number, number, number],
                        target: [t.x, t.y, t.z] as [number, number, number],
                        fov
                    }
                }] : [];

                const includeAnimation = animationToggle.value;
                const animTracks: AnimTrack[] = [];

                if (includeAnimation && orderedPoses.length > 0) {
                    const times: number[] = [];
                    const position: number[] = [];
                    const target: number[] = [];
                    const fovKeys: number[] = [];
                    for (let i = 0; i < orderedPoses.length; ++i) {
                        const op = orderedPoses[i];
                        times.push(op.frame);
                        position.push(op.position.x, op.position.y, op.position.z);
                        target.push(op.target.x, op.target.y, op.target.z);
                        fovKeys.push(op.fov ?? fov);
                    }

                    animTracks.push({
                        name: 'cameraAnim',
                        duration: frames / frameRate,
                        frameRate,
                        loopMode: loopSelect.value as 'none' | 'repeat' | 'pingpong',
                        interpolation: 'spline',
                        smoothness,
                        keyframes: {
                            times,
                            values: { position, target, fov: fovKeys }
                        }
                    });
                }

                const bgColor = colorPicker.value.slice(0, 3) as [number, number, number];

                const experienceSettings: ExperienceSettings = {
                    version: 2,
                    tonemapping: 'none',
                    highPrecisionRendering: false,
                    background: { color: bgColor },
                    postEffectSettings: defaultPostEffectSettings,
                    animTracks,
                    cameras,
                    annotations: [],
                    startMode: includeAnimation ? 'animTrack' : 'default',
                    hasStartPose
                };

                return {
                    filename: filenameEntry.value,
                    splatIdx: 'all',
                    serializeSettings: {
                        maxSHBands: bandsSlider.value
                    },
                    viewerExportSettings: {
                        type: viewerTypeSelect.value,
                        experienceSettings
                    }
                };
            };

            return new Promise<null | SceneExportOptions>((resolve) => {
                onCancel = () => {
                    resolve(null);
                };

                onExport = () => {
                    switch (exportType) {
                        case 'ply':
                            resolve(assemblePlyOptions());
                            break;
                        case 'splat':
                            resolve(assembleSplatOptions());
                            break;
                        case 'sog':
                            resolve(assembleSogOptions());
                            break;
                        case 'viewer':
                            resolve(assembleViewerOptions());
                            break;
                    }
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
