import { Container, InfoBox, Label } from 'pcui';
import { ControlPanel } from './control-panel';
import { Toolbar } from './toolbar';
import { Events } from '../events';
import { ToolManager } from '../tools/tool-manager';
import { MoveTool } from '../tools/move-tool';
import { RectSelection } from '../tools/rect-selection';
import { BrushSelection } from '../tools/brush-selection';
import logo from './playcanvas-logo.png';

class EditorUI {
    appContainer: Container;
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
            dom: document.getElementById('app-container')
        });

        // editor
        const editorContainer = new Container({
            id: 'editor-container'
        });

        // toolbar
        const toolbar = new Toolbar(events, appContainer);

        // canvas
        const canvas = document.createElement('canvas');
        canvas.id = 'canvas';

        // filename label
        const filenameLabel = new Label({
            id: 'filename-label'
        });

        const canvasContainer = new Container({
            id: 'canvas-container'
        });
        canvasContainer.dom.appendChild(canvas);
        canvasContainer.append(filenameLabel);

        // control panel
        const controlPanel = new ControlPanel(events, remoteStorageMode);

        // tool manager
        const toolManager = new ToolManager(events);
        toolManager.register(new MoveTool(events, canvasContainer.dom));
        toolManager.register(new RectSelection(events, canvasContainer.dom));
        toolManager.register(new BrushSelection(events, canvasContainer.dom));

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

        // file select
        const fileSelect = new Container({
            id: 'file-selector-container'
        });

        controlPanel.append(fileSelect);

        editorContainer.append(toolbar);
        editorContainer.append(controlPanel);
        editorContainer.append(canvasContainer);
        appContainer.append(editorContainer);
        appContainer.append(errorPopup);
        appContainer.append(infoPopup);

        this.appContainer = appContainer;
        this.controlPanel = controlPanel;
        this.canvasContainer = canvasContainer;
        this.canvas = canvas;
        this.filenameLabel = filenameLabel;
        this.errorPopup = errorPopup;
        this.infoPopup = infoPopup;

        window.showError = (err: string) => this.showError(err);
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
