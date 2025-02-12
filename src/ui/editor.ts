import { Container, Label } from 'pcui';
import { Mat4, Vec3 } from 'playcanvas';

import { DataPanel } from './data-panel';
import { Events } from '../events';
import { BottomToolbar } from './bottom-toolbar';
import { ColorPanel } from './color-panel';
import { localize, localizeInit } from './localization';
import { Menu } from './menu';
import { ModeToggle } from './mode-toggle';
import logo from './playcanvas-logo.png';
import { Popup, ShowOptions } from './popup';
import { PublishSettingsDialog } from './publish-settings-dialog';
import { RightToolbar } from './right-toolbar';
import { ScenePanel } from './scene-panel';
import { ShortcutsPopup } from './shortcuts-popup';
import { Spinner } from './spinner';
import { TimelinePanel } from './timeline-panel';
import { Tooltips } from './tooltips';
import { ViewCube } from './view-cube';
import { ViewPanel } from './view-panel';
import { ViewerExportPopup } from './viewer-export-popup';
import { version } from '../../package.json';

class EditorUI {
    appContainer: Container;
    topContainer: Container;
    canvasContainer: Container;
    toolsContainer: Container;
    canvas: HTMLCanvasElement;
    popup: Popup;

    constructor(events: Events, remoteStorageMode: boolean) {
        localizeInit();

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

        // cursor label
        const cursorLabel = new Label({
            id: 'cursor-label'
        });

        let fullprecision = '';

        events.on('camera.focalPointPicked', (details: { position: Vec3 }) => {
            cursorLabel.text = `${details.position.x.toFixed(2)}, ${details.position.y.toFixed(2)}, ${details.position.z.toFixed(2)}`;
            fullprecision = `${details.position.x}, ${details.position.y}, ${details.position.z}`;
        });

        ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick'].forEach((eventName) => {
            cursorLabel.dom.addEventListener(eventName, (event: Event) => event.stopPropagation());
        });

        cursorLabel.dom.addEventListener('pointerdown', () => {
            navigator.clipboard.writeText(fullprecision);

            const orig = cursorLabel.text;
            cursorLabel.text = localize('cursor.copied');
            setTimeout(() => {
                cursorLabel.text = orig;
            }, 1000);
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
        const viewPanel = new ViewPanel(events, tooltips);
        const colorPanel = new ColorPanel(events, tooltips);
        const bottomToolbar = new BottomToolbar(events, tooltips);
        const rightToolbar = new RightToolbar(events, tooltips);
        const modeToggle = new ModeToggle(events, tooltips);
        const menu = new Menu(events);

        canvasContainer.dom.appendChild(canvas);
        canvasContainer.append(appLabel);
        canvasContainer.append(cursorLabel);
        canvasContainer.append(toolsContainer);
        canvasContainer.append(scenePanel);
        canvasContainer.append(viewPanel);
        canvasContainer.append(colorPanel);
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
        const dataPanel = new DataPanel(events);

        mainContainer.append(canvasContainer);
        mainContainer.append(timelinePanel);
        mainContainer.append(dataPanel);

        editorContainer.append(mainContainer);

        tooltips.register(cursorLabel, localize('cursor.click-to-copy'), 'top');

        // message popup
        const popup = new Popup(tooltips);

        // shortcuts popup
        const shortcutsPopup = new ShortcutsPopup();

        // export popup
        const viewerExportPopup = new ViewerExportPopup(events);

        // publish options
        const publishSettingsDialog = new PublishSettingsDialog(events);

        topContainer.append(popup);
        topContainer.append(viewerExportPopup);
        topContainer.append(publishSettingsDialog);

        appContainer.append(editorContainer);
        appContainer.append(topContainer);
        appContainer.append(tooltipsContainer);
        appContainer.append(shortcutsPopup);

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

        events.function('show.viewerExportPopup', (filename?: string) => {
            return viewerExportPopup.show(filename);
        });

        events.function('show.publishSettingsDialog', () => {
            return publishSettingsDialog.show();
        });

        events.function('show.about', () => {
            return this.popup.show({
                type: 'info',
                header: 'About',
                message: `SUPERSPLAT v${version}`
            });
        });

        events.function('showPopup', (options: ShowOptions) => {
            return this.popup.show(options);
        });

        // spinner

        const spinner = new Spinner();

        topContainer.append(spinner);

        events.on('startSpinner', () => {
            spinner.hidden = false;
        });

        events.on('stopSpinner', () => {
            spinner.hidden = true;
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
