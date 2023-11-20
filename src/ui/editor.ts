import { Container, InfoBox } from 'pcui';
import { version as supersplatVersion } from '../../package.json';
import { ControlPanel } from './control-panel';
import logo from './playcanvas-logo.png';

class EditorUI {
    appContainer: Container;
    leftContainer: Container;
    controlPanel: ControlPanel;
    canvasContainer: Container;
    canvas: HTMLCanvasElement;
    errorPopup: InfoBox;
    infoPopup: InfoBox;

    constructor() {
        // favicon
        const link = document.createElement('link');
        link.rel = 'icon';
        link.href = logo.src;
        document.head.appendChild(link);

        // app
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

        canvasContainer.dom.appendChild(canvas);

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

        appContainer.append(leftContainer);
        appContainer.append(canvasContainer);
        appContainer.append(errorPopup);
        appContainer.append(infoPopup);

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
        this.errorPopup = errorPopup;
        this.infoPopup = infoPopup;
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
}

export { EditorUI };
