import { BooleanInput, Button, ColorPicker, Container, Element, Label, SelectInput, SliderInput, TextInput } from '@playcanvas/pcui';

import { Pose } from '../camera-poses';
import { i18n } from './localization';
import { Events } from '../events';
import { ExportSettings } from '../export-settings';
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
        '.lcc2',
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

const isValidFilename = (filename: string) => {
    return !!filename.trim() && !/[<>:"/\\|?*]|[. ]$/.test(filename) &&
        !Array.from(filename).some(char => char.charCodeAt(0) < 32) &&
        !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(filename);
};

class ExportPopup extends Container {
    show: (exportType: ExportType, splatNames: string[], settings?: ExportSettings) => Promise<null | SceneExportOptions>;
    hide: () => void;
    destroy: () => void;

    constructor(events: Events, args = {}) {
        args = {
            id: 'export-popup',
            class: 'blocks-shortcuts',
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
            id: 'header'
        });
        i18n.bindText(headerText, 'popup.export.header');

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
            class: 'label'
        });
        i18n.bindText(viewerTypeLabel, 'popup.export.type');

        const viewerTypeSelect = new SelectInput({
            class: 'select',
            defaultValue: 'html'
        });
        i18n.bindOptions(viewerTypeSelect, () => [
            { v: 'html', t: i18n.t('popup.export.html') },
            { v: 'zip', t: i18n.t('popup.export.package') }
        ]);

        viewerTypeRow.append(viewerTypeLabel);
        viewerTypeRow.append(viewerTypeSelect);

        // viewer: animation

        const animationLabel = new Label({ class: 'label' });
        i18n.bindText(animationLabel, 'popup.export.animation');
        const animationToggle = new BooleanInput({ class: 'boolean', type: 'toggle', value: false });
        const animationRow = new Container({ class: 'row' });
        animationRow.append(animationLabel);
        animationRow.append(animationToggle);

        // viewer: loop mode

        const loopLabel = new Label({ class: 'label' });
        i18n.bindText(loopLabel, 'popup.export.loop-mode');
        const loopSelect = new SelectInput({
            class: 'select',
            defaultValue: 'repeat'
        });
        i18n.bindOptions(loopSelect, () => [
            { v: 'none', t: i18n.t('popup.export.loop-mode.none') },
            { v: 'repeat', t: i18n.t('popup.export.loop-mode.repeat') },
            { v: 'pingpong', t: i18n.t('popup.export.loop-mode.pingpong') }
        ]);
        const loopRow = new Container({ class: 'row' });
        loopRow.append(loopLabel);
        loopRow.append(loopSelect);

        // viewer: clear color

        const colorRow = new Container({
            class: 'row'
        });

        const colorLabel = new Label({
            class: 'label'
        });
        i18n.bindText(colorLabel, 'popup.export.background-color');

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
            class: 'label'
        });
        i18n.bindText(fovLabel, 'popup.export.fov');

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
            class: 'label'
        });
        i18n.bindText(compressLabel, 'popup.export.compress-ply');

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
            class: 'label'
        });
        i18n.bindText(bandsLabel, 'popup.export.sh-bands');

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
            class: 'label'
        });
        i18n.bindText(iterationsLabel, 'popup.export.iterations');

        const iterationsSlider = new SliderInput({
            class: 'slider',
            min: 1,
            max: 20,
            precision: 0,
            value: 10
        });

        iterationsRow.append(iterationsLabel);
        iterationsRow.append(iterationsSlider);

        // spz version

        const spzVersionRow = new Container({
            class: 'row'
        });

        const spzVersionLabel = new Label({
            class: 'label'
        });
        i18n.bindText(spzVersionLabel, 'popup.export.spz-version');

        const spzVersionSelect = new SelectInput({
            class: 'select',
            defaultValue: '4'
        });
        i18n.bindOptions(spzVersionSelect, () => [
            { v: '4', t: i18n.t('popup.export.spz-version.4') },
            { v: '3', t: i18n.t('popup.export.spz-version.3') }
        ]);

        spzVersionRow.append(spzVersionLabel);
        spzVersionRow.append(spzVersionSelect);

        // location

        const locationRow = new Container({ class: 'row' });
        const locationLabel = new Label({ class: 'label' });
        i18n.bindText(locationLabel, 'popup.export.location');
        const locationValue = new Container({ class: 'location' });
        const locationName = new Label({ class: 'location-name' });
        const changeLocationButton = new Button({ class: 'change-location' });
        i18n.bindText(changeLocationButton, 'popup.export.change-location');
        locationValue.append(locationName);
        locationValue.append(changeLocationButton);
        locationRow.append(locationLabel);
        locationRow.append(locationValue);

        // filename

        const filenameRow = new Container({
            class: 'row'
        });

        const filenameLabel = new Label({
            class: 'label'
        });
        i18n.bindText(filenameLabel, 'popup.export.filename');

        const filenameEntry = new TextInput({
            class: 'text-input',
            blurOnEnter: false
        });

        const filenameMessage = new Label({ id: 'export-filename-message', hidden: true });
        filenameMessage.dom.setAttribute('role', 'tooltip');
        filenameMessage.dom.setAttribute('aria-live', 'polite');
        filenameEntry.input.setAttribute('aria-describedby', 'export-filename-message');

        const filenameField = new Container({ class: 'filename-field' });
        filenameField.append(filenameEntry);
        filenameField.append(filenameMessage);
        filenameRow.append(filenameLabel);
        filenameRow.append(filenameField);

        // content

        content.append(locationRow);
        content.append(filenameRow);
        content.append(viewerTypeRow);
        content.append(animationRow);
        content.append(loopRow);
        content.append(colorRow);
        content.append(fovRow);
        content.append(compressRow);
        content.append(bandsRow);
        content.append(iterationsRow);
        content.append(spzVersionRow);

        // footer

        const footer = new Container({ id: 'footer' });

        const cancelButton = new Button({
            class: 'button'
        });
        i18n.bindText(cancelButton, 'popup.cancel');

        const exportButton = new Button({
            class: 'button'
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
        let directory: FileSystemDirectoryHandle;
        let validationId = 0;
        let existingHandle: FileSystemFileHandle;
        let submitting = false;

        const validateFilename = async (suggest = false): Promise<void> => {
            if (this.hidden) return;
            const id = ++validationId;
            const filename = filenameEntry.value;
            exportButton.enabled = false;
            exportButton.text = i18n.t('popup.export');

            let message = '';
            let handle: FileSystemFileHandle;
            let needsSuggestion = false;
            if (!isValidFilename(filename)) {
                message = i18n.t('popup.export.invalid-filename');
                needsSuggestion = true;
            } else if (directory) {
                try {
                    handle = await directory.getFileHandle(filename);
                    if ((await events.invoke('scene.sourcesOf', handle)).length > 0) {
                        message = i18n.t('popup.overwrite-source');
                        needsSuggestion = true;
                    }
                } catch (error) {
                    if (error.name === 'TypeError' || error.name === 'TypeMismatchError') {
                        message = i18n.t('popup.export.invalid-filename');
                        needsSuggestion = true;
                    } else if (error.name !== 'NotFoundError') {
                        message = `${error.message ?? error}`;
                    }
                }
            }

            if (suggest && needsSuggestion) {
                let stem = removeKnownExtension(filename);
                if (stem === filename && filename.lastIndexOf('.') > 0) {
                    stem = filename.slice(0, filename.lastIndexOf('.'));
                }
                const extension = filename.slice(stem.length);
                let base = Array.from(stem).map(char => (char.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(char) ? '_' : char))
                .join('').trim().replace(/[. ]+$/, '') || 'scene';
                if (!isValidFilename(`${base}_cleaned${extension}`)) base = 'scene';

                let index = 1;
                while (true) {
                    if (id !== validationId) return;
                    const candidate = `${base}_cleaned${index === 1 ? '' : `_${index}`}${extension}`;
                    let available = !directory;
                    if (directory) {
                        try {
                            await directory.getFileHandle(candidate);
                        } catch (error) {
                            if (error.name === 'NotFoundError') {
                                available = true;
                            } else if (error.name === 'TypeError' && base !== 'scene') {
                                base = 'scene';
                                index = 1;
                                continue;
                            } else if (error.name !== 'TypeMismatchError') {
                                message = `${error.message ?? error}`;
                                break;
                            }
                        }
                    }
                    if (id !== validationId) return;
                    if (available) {
                        filenameEntry.value = candidate;
                        if (document.activeElement === filenameEntry.input) filenameEntry.focus(true);
                        await validateFilename();
                        return;
                    }
                    index++;
                }
            }

            // Ignore results for an older filename, folder or closed dialog.
            if (id !== validationId) return;
            existingHandle = handle;
            filenameMessage.text = message || (handle ? i18n.t('popup.export.overwrite-message') : '');
            filenameMessage.hidden = !filenameMessage.text;
            filenameMessage.dom.classList.toggle('error', !!message);
            filenameEntry.input.setAttribute('aria-invalid', String(!!message));
            exportButton.text = i18n.t(handle && !message ? 'popup.export.overwrite' : 'popup.export');
            exportButton.enabled = !message && changeLocationButton.enabled && !submitting;
        };

        i18n.onChange(validateFilename, this);
        filenameEntry.input.addEventListener('input', () => validateFilename());

        changeLocationButton.on('click', async () => {
            validationId++;
            changeLocationButton.enabled = false;
            exportButton.enabled = false;
            const selected = await events.invoke('scene.pickExportDirectory');
            if (selected) {
                directory = selected;
                locationName.text = `…/${directory.name}`;
                locationName.dom.title = locationName.text;
            }
            changeLocationButton.enabled = true;
            validateFilename();
        });

        cancelButton.on('click', () => onCancel());
        exportButton.on('click', () => onExport());

        const keydown = (e: KeyboardEvent) => {
            e.stopPropagation();
            if (e.isComposing) return;
            switch (e.key) {
                case 'Escape':
                    e.preventDefault();
                    onCancel();
                    break;
                case 'Enter':
                    if (!e.shiftKey && !(e.target as HTMLElement).closest('button')) {
                        e.preventDefault();
                        onExport();
                    }
                    break;
            }
        };
        filenameEntry.on('keydown', keydown);

        const updateExtension = (ext: string) => {
            filenameEntry.value = removeKnownExtension(filenameEntry.value) + ext;
            validateFilename();
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

        const reset = (exportType: ExportType, splatNames: string[], hasPoses: boolean, settings: ExportSettings) => {
            const { filename: previousFilename, exportType: previousExportType } = settings;
            const allRows = [
                viewerTypeRow, animationRow, loopRow, colorRow, fovRow, compressRow, bandsRow, iterationsRow, spzVersionRow
            ];

            const activeRows: Container[] = {
                ply: [compressRow, bandsRow],
                splat: [],
                sog: [bandsRow, iterationsRow],
                spz: [bandsRow, spzVersionRow],
                viewer: [viewerTypeRow, animationRow, loopRow, colorRow, fovRow, bandsRow]
            }[exportType];

            allRows.forEach((r) => {
                r.hidden = activeRows.indexOf(r) === -1;
            });

            bandsSlider.value = events.invoke('view.bands');

            // ply
            compressBoolean.value = false;

            // sog
            iterationsSlider.value = 10;

            // spz
            spzVersionSelect.value = '4';

            // filename
            filenameEntry.value = previousFilename ?? splatNames[0];
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
                case 'spz':
                    updateExtension('.spz');
                    break;
                case 'viewer':
                    updateExtension(viewerTypeSelect.value === 'html' ? '.html' : '.zip');
                    break;
            }
            if (exportType === previousExportType) {
                filenameEntry.value = previousFilename;
            }

            // viewer
            const bgClr = events.invoke('bgClr');

            animationToggle.value = hasPoses;
            animationToggle.enabled = hasPoses;
            loopSelect.value = events.invoke('timeline.loop') ? 'repeat' : 'none';
            loopSelect.enabled = hasPoses;

            colorPicker.value = [bgClr.r, bgClr.g, bgClr.b];

            fovSlider.value = events.invoke('camera.fov');
        };

        this.show = (exportType: ExportType, splatNames: string[], settings: ExportSettings = {}) => {
            const frames = events.invoke('timeline.frames');
            const frameRate = events.invoke('timeline.frameRate');
            const smoothness = events.invoke('timeline.smoothness');
            const orderedPoses = (events.invoke('camera.poses') as Pose[])
            .slice()
            .filter(p => p.frame >= 0 && p.frame < frames)
            .sort((a, b) => a.frame - b.frame);

            reset(exportType, splatNames, orderedPoses.length > 0, settings);

            directory = settings.directory;
            locationRow.hidden = !directory;
            locationName.text = directory ? `…/${directory.name}` : '';
            locationName.dom.title = locationName.text;

            filenameMessage.text = '';
            filenameMessage.hidden = true;
            this.hidden = false;
            validateFilename(true);
            this.dom.addEventListener('keydown', keydown);
            filenameEntry.focus(true);

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

            const assembleSpzOptions = () : SceneExportOptions => {
                return {
                    filename: filenameEntry.value,
                    splatIdx: 'all',
                    serializeSettings: {
                        maxSHBands: bandsSlider.value
                    },
                    spzVersion: spzVersionSelect.value === '3' ? 3 : 4
                };
            };

            const assembleViewerOptions = () : SceneExportOptions => {
                const fov = fovSlider.value;

                // use current viewport as start pose
                const pose = events.invoke('camera.getPose');
                const p = pose?.position;
                const t = pose?.target;
                const cameras = (p && t) ? [{
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
                    postEffectSettings: defaultPostEffectSettings(),
                    animTracks,
                    cameras,
                    annotations: [],
                    startMode: includeAnimation ? 'animTrack' : 'default'
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

                onExport = async () => {
                    if (!exportButton.enabled || submitting) return;
                    const id = validationId;
                    const overwriteHandle = existingHandle;
                    submitting = true;
                    exportButton.enabled = false;
                    try {
                        let fileHandle: FileSystemFileHandle;
                        if (directory) {
                            const target = await events.invoke('scene.pickWriteTarget', directory, filenameEntry.value,
                                async (handle: FileSystemFileHandle) => !!overwriteHandle && await handle.isSameEntry(overwriteHandle));

                            // A newly detected file needs an explicit Overwrite click.
                            // Keep the dialog open if its filename or folder changed while checking.
                            if (!target || id !== validationId || this.hidden) {
                                submitting = false;
                                await validateFilename();
                                return;
                            }
                            fileHandle = target.handle;
                        }

                        const options = {
                            ply: assemblePlyOptions,
                            splat: assembleSplatOptions,
                            sog: assembleSogOptions,
                            spz: assembleSpzOptions,
                            viewer: assembleViewerOptions
                        }[exportType]();
                        resolve({ ...options, fileHandle });
                    } catch (error) {
                        filenameMessage.text = `${error.message ?? error}`;
                        filenameMessage.hidden = false;
                        filenameMessage.dom.classList.add('error');
                        filenameEntry.focus();
                    } finally {
                        submitting = false;
                    }
                };
            }).finally(() => {
                this.dom.removeEventListener('keydown', keydown);
                this.hide();
            });
        };

        this.hide = () => {
            validationId++;
            this.hidden = true;
        };

        this.destroy = () => {
            this.hide();
            super.destroy();
        };
    }
}

export { ExportPopup };
