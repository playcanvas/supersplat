import { Container, Label } from '@playcanvas/pcui';
import { Mat4 } from 'playcanvas';

import { DataPanel } from './data-panel';
import { Events } from '../events';
import { AboutPopup } from './about-popup';
import { BottomToolbar } from './bottom-toolbar';
import { CameraInfoOverlay } from './camera-info-overlay';
import { CollisionMeshPanel } from './collision-mesh-panel';
import { ColorPanel } from './color-panel';
import { ExportPopup } from './export-popup';
import { ImageSettingsDialog } from './image-settings-dialog';
import { i18n } from './localization';
import { Menu } from './menu';
import { ModeToggle } from './mode-toggle';
import logo from './playcanvas-logo.png';
import { Popup, ShowOptions } from './popup';
import { Progress } from './progress';
import { PublishSettingsDialog } from './publish-settings-dialog';
import { RightToolbar } from './right-toolbar';
import { ScenePanel } from './scene-panel';
import { SettingsPanel } from './settings-panel';
import { ShortcutsPopup } from './shortcuts-popup';
import { Spinner } from './spinner';
import { StatusBar } from './status-bar';
import { TimelinePanel } from './timeline-panel';
import { Tooltips } from './tooltips';
import { VideoSettingsDialog } from './video-settings-dialog';
import { ViewCube } from './view-cube';
import { version } from '../../package.json';

// ts compiler and vscode find this type, but eslint does not
type FilePickerAcceptType = unknown;

class EditorUI {
    appContainer: Container;
    topContainer: Container;
    canvasContainer: Container;
    toolsContainer: Container;
    canvas: HTMLCanvasElement;
    popup: Popup;

    constructor(events: Events) {
        // favicon
        const link = document.createElement('link');
        link.rel = 'icon';
        link.href = logo;
        document.head.appendChild(link);

        // app
        const appContainer = new Container({
            id: 'app-container'
        });

        // editor
        const editorContainer = new Container({
            id: 'editor-container'
        });

        // tooltips container
        const tooltipsContainer = new Container({
            id: 'tooltips-container'
        });

        // top container
        const topContainer = new Container({
            id: 'top-container'
        });

        // canvas
        const canvas = document.createElement('canvas');
        canvas.id = 'canvas';

        // app label
        const appLabel = new Label({
            id: 'app-label',
            text: `SUPERSPLAT v${version}`
        });

        // canvas container
        const canvasContainer = new Container({
            id: 'canvas-container'
        });

        // tools container
        const toolsContainer = new Container({
            id: 'tools-container'
        });

        // tooltips
        const tooltips = new Tooltips();
        tooltipsContainer.append(tooltips);

        // bottom toolbar
        const scenePanel = new ScenePanel(events, tooltips);
        const settingsPanel = new SettingsPanel(events, tooltips);
        const colorPanel = new ColorPanel(events, tooltips);
        const collisionMeshPanel = new CollisionMeshPanel(events, tooltips);
        const bottomToolbar = new BottomToolbar(events, tooltips);
        const rightToolbar = new RightToolbar(events, tooltips);
        const modeToggle = new ModeToggle(events, tooltips);
        const menu = new Menu(events);
        const cameraInfoOverlay = new CameraInfoOverlay(events, tooltips);

        canvasContainer.dom.appendChild(canvas);
        canvasContainer.append(appLabel);
        canvasContainer.append(cameraInfoOverlay);
        canvasContainer.append(toolsContainer);
        canvasContainer.append(scenePanel);
        canvasContainer.append(settingsPanel);
        canvasContainer.append(colorPanel);
        canvasContainer.append(collisionMeshPanel);
        canvasContainer.append(bottomToolbar);
        canvasContainer.append(rightToolbar);
        canvasContainer.append(modeToggle);
        canvasContainer.append(menu);

        // view axes container
        const viewCube = new ViewCube(events);
        canvasContainer.append(viewCube);
        events.on('prerender', (cameraMatrix: Mat4) => {
            viewCube.update(cameraMatrix);
        });

        // main container
        const mainContainer = new Container({
            id: 'main-container'
        });

        const timelinePanel = new TimelinePanel(events, tooltips);
        const dataPanel = new DataPanel(events, tooltips);
        const statusBar = new StatusBar(events, tooltips);

        timelinePanel.hidden = true;

        mainContainer.append(canvasContainer);
        mainContainer.append(timelinePanel);
        mainContainer.append(dataPanel);
        mainContainer.append(statusBar);

        // Wire up status bar panel toggles
        events.on('statusBar.panelChanged', (panel: string | null) => {
            timelinePanel.hidden = panel !== 'timeline';
            dataPanel.hidden = panel !== 'splatData';
        });

        editorContainer.append(mainContainer);

        // message popup
        const popup = new Popup(tooltips);

        // shortcuts popup
        const shortcutsPopup = new ShortcutsPopup(events);

        // export popup
        const exportPopup = new ExportPopup(events);

        // publish settings
        const publishSettingsDialog = new PublishSettingsDialog(events);

        // image settings
        const imageSettingsDialog = new ImageSettingsDialog(events);

        // video settings
        const videoSettingsDialog = new VideoSettingsDialog(events);

        // about popup
        const aboutPopup = new AboutPopup();

        topContainer.append(popup);
        topContainer.append(exportPopup);
        topContainer.append(publishSettingsDialog);
        topContainer.append(imageSettingsDialog);
        topContainer.append(videoSettingsDialog);
        topContainer.append(shortcutsPopup);
        topContainer.append(aboutPopup);

        appContainer.append(editorContainer);
        appContainer.append(topContainer);
        appContainer.append(tooltipsContainer);

        this.appContainer = appContainer;
        this.topContainer = topContainer;
        this.canvasContainer = canvasContainer;
        this.toolsContainer = toolsContainer;
        this.canvas = canvas;
        this.popup = popup;

        document.body.appendChild(appContainer.dom);
        document.body.setAttribute('tabIndex', '-1');

        events.on('show.shortcuts', () => {
            shortcutsPopup.hidden = false;
        });

        events.function('show.exportPopup', (exportType, splatNames: [string], showFilenameEdit: boolean) => {
            return exportPopup.show(exportType, splatNames, showFilenameEdit);
        });

        events.function('show.publishSettingsDialog', async () => {
            // show popup if user isn't logged in
            const userStatus = await events.invoke('publish.userStatus');
            if (!userStatus) {
                await events.invoke('showPopup', {
                    type: 'error',
                    header: i18n.t('popup.error'),
                    message: i18n.t('popup.publish.please-log-in')
                });
                return false;
            }

            // get user publish settings
            const publishSettings = await publishSettingsDialog.show(userStatus);

            // do publish
            if (publishSettings) {
                await events.invoke('scene.publish', publishSettings);
            }
        });

        events.function('show.imageSettingsDialog', async () => {
            const imageSettings = await imageSettingsDialog.show();

            if (imageSettings) {
                try {
                    let writable;
                    let fileHandle: FileSystemFileHandle | undefined;

                    const imageFileTypes: Record<string, { description: string, accept: Record<`${string}/${string}`, `.${string}`[]>, extension: string }> = {
                        png: { description: 'PNG Image', accept: { 'image/png': ['.png'] }, extension: '.png' },
                        jpeg: { description: 'JPEG Image', accept: { 'image/jpeg': ['.jpg', '.jpeg'] }, extension: '.jpg' },
                        webp: { description: 'WebP Image', accept: { 'image/webp': ['.webp'] }, extension: '.webp' }
                    };
                    const imageFileType = imageFileTypes[imageSettings.format];

                    if (window.showSaveFilePicker) {
                        fileHandle = await window.showSaveFilePicker({
                            id: 'SuperSplatImageFileExport',
                            types: [{
                                description: imageFileType.description,
                                accept: imageFileType.accept
                            }],
                            suggestedName: `${events.invoke('render.baseFilename')}${imageFileType.extension}`
                        });

                        writable = await fileHandle.createWritable();
                    }

                    const result = await events.invoke('render.image', imageSettings, writable);

                    // if the render failed, remove the empty file left on disk
                    if (result === false && fileHandle?.remove) {
                        await fileHandle.remove();
                    }
                } catch (error) {
                    if (error instanceof DOMException && error.name === 'AbortError') {
                        // user cancelled save dialog
                        return;
                    }

                    await events.invoke('showPopup', {
                        type: 'error',
                        header: i18n.t('panel.render.failed'),
                        message: `'${error.message ?? error}'`
                    });
                }
            }
        });

        events.function('show.videoSettingsDialog', async () => {
            const videoSettings = await videoSettingsDialog.show();

            if (videoSettings) {

                try {
                    // Determine file extension and mime type based on format
                    let fileExtension: string;
                    let filePickerTypes: FilePickerAcceptType[];

                    // Codec name mapping for display
                    const codecNames: Record<string, string> = {
                        'h264': 'H.264',
                        'h265': 'H.265',
                        'vp9': 'VP9',
                        'av1': 'AV1'
                    };
                    const codecName = codecNames[videoSettings.codec] || videoSettings.codec.toUpperCase();

                    if (videoSettings.format === 'webm') {
                        fileExtension = '.webm';
                        filePickerTypes = [{
                            description: `WebM Video (${codecName})`,
                            accept: { 'video/webm': ['.webm'] }
                        }];
                    } else if (videoSettings.format === 'mov') {
                        fileExtension = '.mov';
                        filePickerTypes = [{
                            description: `MOV Video (${codecName})`,
                            accept: { 'video/quicktime': ['.mov'] }
                        }];
                    } else if (videoSettings.format === 'mkv') {
                        fileExtension = '.mkv';
                        filePickerTypes = [{
                            description: `MKV Video (${codecName})`,
                            accept: { 'video/x-matroska': ['.mkv'] }
                        }];
                    } else {
                        fileExtension = '.mp4';
                        filePickerTypes = [{
                            description: `MP4 Video (${codecName})`,
                            accept: { 'video/mp4': ['.mp4'] }
                        }];
                    }

                    const suggested = `${events.invoke('render.baseFilename')}${fileExtension}`;

                    let writable;
                    let fileHandle: FileSystemFileHandle | undefined;

                    if (window.showSaveFilePicker) {
                        fileHandle = await window.showSaveFilePicker({
                            id: 'SuperSplatVideoFileExport',
                            types: filePickerTypes,
                            suggestedName: suggested
                        });

                        writable = await fileHandle.createWritable();
                    }

                    const result = await events.invoke('render.video', videoSettings, writable);

                    // if the render was cancelled, remove the empty file left on disk
                    if (result === false && fileHandle?.remove) {
                        await fileHandle.remove();
                    }
                } catch (error) {
                    if (error instanceof DOMException && error.name === 'AbortError') {
                        // user cancelled save dialog
                        return;
                    }

                    await events.invoke('showPopup', {
                        type: 'error',
                        header: i18n.t('panel.render.failed'),
                        message: `'${error.message ?? error}'`
                    });
                }
            }
        });

        events.on('show.about', () => {
            aboutPopup.hidden = false;
        });

        events.function('showPopup', (options: ShowOptions) => {
            return this.popup.show(options);
        });

        // spinner with reference counting to handle nested operations
        const spinner = new Spinner();
        topContainer.append(spinner);

        let spinnerCount = 0;

        events.on('startSpinner', () => {
            spinnerCount++;
            if (spinnerCount === 1) {
                spinner.hidden = false;
            }
        });

        events.on('stopSpinner', () => {
            spinnerCount = Math.max(0, spinnerCount - 1);
            if (spinnerCount === 0) {
                spinner.hidden = true;
            }
        });

        // progress

        const progress = new Progress();

        topContainer.append(progress);

        events.on('progressStart', (header: string, cancellable?: boolean) => {
            progress.hidden = false;
            progress.setHeader(header);
            progress.setText('');
            progress.setProgress(0);
            progress.showCancelButton(!!cancellable);
            progress.onCancel = cancellable ? () => events.fire('progressCancel') : null;
        });

        events.on('progressUpdate', (options: { text?: string, progress?: number }) => {
            if (options.text !== undefined) {
                progress.setText(options.text);
            }
            if (options.progress !== undefined) {
                progress.setProgress(options.progress);
            }
        });

        events.on('progressEnd', () => {
            progress.hidden = true;
            progress.showCancelButton(false);
            progress.onCancel = null;
        });

        // initialize canvas to correct size before creating graphics device etc
        const pixelRatio = window.devicePixelRatio;
        canvas.width = Math.ceil(canvasContainer.dom.offsetWidth * pixelRatio);
        canvas.height = Math.ceil(canvasContainer.dom.offsetHeight * pixelRatio);

        ['contextmenu', 'gesturestart', 'gesturechange', 'gestureend'].forEach((event) => {
            document.addEventListener(event, (e) => {
                e.preventDefault();
            }, true);
        });

        // whenever the canvas container is clicked, set keyboard focus on the body
        canvasContainer.dom.addEventListener('pointerdown', (event: PointerEvent) => {
            // set focus on the body if user is busy pressing on the canvas or a child of the tools
            // element
            if (event.target === canvas || toolsContainer.dom.contains(event.target as Node)) {
                document.body.focus();
            }
        }, true);
    }
}

export { EditorUI };
