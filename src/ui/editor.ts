import { Container, InfoBox, Label } from 'pcui';
import { ControlPanel } from './control-panel';
import { Toolbar } from './toolbar';
import { Events } from '../events';
import logo from './playcanvas-logo.png';

class EditorUI {
    appContainer: Container;
    overlaysContainer: Container;
    controlPanel: ControlPanel;
    canvasContainer: Container;
    canvas: HTMLCanvasElement;
    filenameLabel: Label;
    errorPopup: InfoBox;
    infoPopup: InfoBox;

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

        // top container
        const topContainer = new Container({
            id: 'top-container'
        });
        
        // toolbar
        const toolbar = new Toolbar(events, appContainer, topContainer);

        // canvas
        const canvas = document.createElement('canvas');
        canvas.id = 'canvas';

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

        // file select
        const fileSelect = new Container({
            id: 'file-selector-container'
        });

        controlPanel.append(fileSelect);

        editorContainer.append(toolbar);
        editorContainer.append(controlPanel);
        editorContainer.append(canvasContainer);

        // error box 
        const errorPopup = new InfoBox({
            class: 'error-popup',
            icon: 'E218',
            title: 'Error',
            hidden: true
        });

        // info box
        const infoPopup = new InfoBox({
            class: 'info-popup',
            icon: 'E400',
            title: 'Info',
            hidden: true
        });

        topContainer.append(errorPopup);
        topContainer.append(infoPopup);

        appContainer.append(editorContainer);
        appContainer.append(topContainer);

        this.appContainer = appContainer;
        this.overlaysContainer = topContainer;
        this.controlPanel = controlPanel;
        this.canvasContainer = canvasContainer;
        this.canvas = canvas;
        this.filenameLabel = filenameLabel;
        this.errorPopup = errorPopup;
        this.infoPopup = infoPopup;

        document.body.appendChild(appContainer.dom);

        window.showError = (err: string) => this.showError(err);

        // initialize canvas to correct size before creating graphics device etc
        const pixelRatio = window.devicePixelRatio;
        canvas.width = Math.ceil(canvasContainer.dom.offsetWidth * pixelRatio);
        canvas.height = Math.ceil(canvasContainer.dom.offsetHeight * pixelRatio);
    }

    showError(err: string) {
        if (err) {
            this.errorPopup.text = err;
            this.errorPopup.hidden = false;
        } else {
            this.errorPopup.hidden = true;
        }
    }

    showInfo(info: string) {
        if (info) {
            this.infoPopup.text = info;
            this.infoPopup.hidden = false;
        } else {
            this.infoPopup.hidden = true;
        }
    }

    setFilename(filename: string) {
        this.filenameLabel.text = filename;
    }
}

export { EditorUI };
