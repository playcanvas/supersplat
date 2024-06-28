import { Container, Label } from 'pcui';
import { ControlPanel } from './control-panel';
import { Toolbar } from './toolbar';
import { Events } from '../events';
import { Popup } from './popup';
import logo from './playcanvas-logo.png';

class EditorUI {
    appContainer: Container;
    topContainer: Container;
    controlPanel: ControlPanel;
    canvasContainer: Container;
    canvas: HTMLCanvasElement;
    filenameLabel: Label;
    popup: Popup;

    constructor(events: Events, remoteStorageMode: boolean) {
        // favicon
        const link = document.createElement('link');
        link.rel = 'icon';
        link.href = logo.src;
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

        const killit = (event: UIEvent) => {
            event.preventDefault();
            event.stopPropagation();
            return false;
        };

        topContainer.dom.addEventListener('mousemove', (event: MouseEvent) => killit(event));
        topContainer.on('click', (event: MouseEvent) => killit(event));

        // toolbar
        const toolbar = new Toolbar(events, appContainer, tooltipsContainer);

        // canvas
        const canvas = document.createElement('canvas');
        canvas.id = 'canvas';
        canvas.style.touchAction = 'none';

        // filename label
        const filenameLabel = new Label({
            id: 'filename-label'
        });

        // canvas container
        const canvasContainer = new Container({
            id: 'canvas-container'
        });
        canvasContainer.dom.appendChild(canvas);
        canvasContainer.append(filenameLabel);

        // control panel
        const controlPanel = new ControlPanel(events, remoteStorageMode);

        editorContainer.append(toolbar);
        editorContainer.append(controlPanel);
        editorContainer.append(canvasContainer);

        // message popup
        this.popup = new Popup(topContainer);

        appContainer.append(editorContainer);
        appContainer.append(tooltipsContainer);
        appContainer.append(topContainer);

        this.appContainer = appContainer;
        this.topContainer = topContainer;
        this.controlPanel = controlPanel;
        this.canvasContainer = canvasContainer;
        this.canvas = canvas;
        this.filenameLabel = filenameLabel;

        document.body.appendChild(appContainer.dom);

        events.function('showPopup', (options: { type: 'error' | 'info' | 'yesno' | 'okcancel', message: string, value: string}) => {
            return this.popup.show(options.type, options.message, options.value);
        });

        events.function('error', (err: any) => {
            return this.popup.show('error', err);
        });

        events.function('info', (info: string) => {
            return this.popup.show('info', info);
        });

        // initialize canvas to correct size before creating graphics device etc
        const pixelRatio = window.devicePixelRatio;
        canvas.width = Math.ceil(canvasContainer.dom.offsetWidth * pixelRatio);
        canvas.height = Math.ceil(canvasContainer.dom.offsetHeight * pixelRatio);
    }

    setFilename(filename: string) {
        this.filenameLabel.text = filename;
    }
}

export { EditorUI };
