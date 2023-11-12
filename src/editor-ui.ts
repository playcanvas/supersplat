import { Container } from 'pcui';
import { version as supersplatVersion } from '../package.json';
import logo from './ui/playcanvas-logo.png';
import { ControlPanel } from './ui/control-panel';

class EditorUI {
    appContainer: Container;
    leftContainer: Container;
    controlPanel: ControlPanel;
    canvasContainer: Container;
    canvas: HTMLCanvasElement;

    constructor() {
        const appContainer = new Container({
            dom: document.getElementById('app-container')
        });

        const leftContainer = new Container({
            id: 'left-container',
            resizable: 'right',
            resizeMax: 1000
        });

        const canvasContainer = new Container({
            id: 'canvas-container'
        });

        const canvas = document.createElement('canvas');
        canvas.id = 'canvas';

        appContainer.append(leftContainer);
        appContainer.append(canvasContainer);
        canvasContainer.dom.appendChild(canvas);

        // title
        const title = new Container({
            id: 'title-container'
        });

        title.dom.addEventListener('click', () => {
            window.open('https://github.com/playcanvas/super-splat');
        });

        const titleLogo = document.createElement('img');
        titleLogo.id = 'title-logo';
        titleLogo.src = logo.src;

        const titleText = document.createElement('a');
        titleText.id = 'title-text';
        titleText.text =  `SUPER SPLAT v${supersplatVersion}`;

        title.dom.appendChild(titleLogo);
        title.dom.appendChild(titleText);
    
        // control panel
        const controlPanel = new ControlPanel();

        // file select
        const fileSelect = new Container({
            id: 'file-selector-container'
        });

        leftContainer.append(title);
        leftContainer.append(controlPanel); // Parent);
        leftContainer.append(fileSelect);

        this.appContainer = appContainer;
        this.leftContainer = leftContainer;
        this.controlPanel = controlPanel;
        this.canvasContainer = canvasContainer;
        this.canvas = canvas;
    }
}

export { EditorUI };
