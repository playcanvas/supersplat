import { Button, Container, InfoBox, Label, Overlay, Panel, TreeView, TreeViewItem } from 'pcui';
import { ControlPanel } from './control-panel';
import logo from './playcanvas-logo.png';

const shortcutList = [
    { key: 'F', action: 'Focus camera' },
    { key: 'I', action: 'Invert selection' },
    { key: 'R', action: 'Toggle rect selection' },
    { key: 'B', action: 'Toggle brush selection' },
    { key: '[ ]', action: 'Decrease/Increase brush size' },
    { key: 'Shift', action: 'Add to selection' },
    { key: 'Ctrl', action: 'Remove from selection' },
    { key: 'Delete', action: 'Delete selected splats' },
    { key: 'Esc', action: 'Cancel rect selection' },
    { key: 'Ctrl + Z', action: 'Undo' },
    { key: 'Ctrl + Shift + Z', action: 'Redo' },
    { key: 'Space', action: 'Toggle debug splat display' }
];

class EditorUI {
    appContainer: Container;
    controlPanel: ControlPanel;
    canvasContainer: Container;
    canvas: HTMLCanvasElement;
    filenameLabel: Label;
    errorPopup: InfoBox;
    infoPopup: InfoBox;

    constructor(remoteStorageMode: boolean) {
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

        // toolbar-tools
        const toolbarToolsContainer = new Container({
            id: 'toolbar-tools-container'
        });

        // logo
        const appLogo = document.createElement('img');
        appLogo.classList.add('toolbar-button');
        appLogo.id = 'app-logo';
        appLogo.src = logo.src;

        toolbarToolsContainer.dom.appendChild(appLogo);

        // toolbar help toolbar
        const toolbarHelpContainer = new Container({
            id: 'toolbar-help-container'
        });

        // github
        const github = new Button({
            class: 'toolbar-button',
            icon: 'E259' 
        });
        github.on('click', () => {
            window.open('https://github.com/playcanvas/model-viewer', '_blank').focus();
        });

        const shortcutsContainer = new Container({
            id: 'shortcuts-container'
        });

        shortcutList.forEach((shortcut) => {
            const key = new Label({
                class: 'shortcut-key',
                text: shortcut.key
            });

            const action = new Label({
                class: 'shortcut-action',
                text: shortcut.action
            });

            const entry = new Container({
                class: 'shortcut-entry'
            });

            entry.append(key);
            entry.append(action);

            shortcutsContainer.append(entry);
        });

        const shortcutsPanel = new Panel({
            id: 'shortcuts-panel',
            headerText: 'KEYBOARD SHORTCUTS'
        });

        shortcutsPanel.append(shortcutsContainer);

        const shortcutsPopup = new Overlay({
            id: 'shortcuts-popup',
            clickable: true,
            hidden: true
        });
        shortcutsPopup.append(shortcutsPanel);
        appContainer.append(shortcutsPopup);

        // keyboard shortcuts
        const shortcuts = new Button({
            class: 'toolbar-button',
            icon: 'E136'
        });
        shortcuts.on('click', () => {
            shortcutsPopup.hidden = false;
        });

        toolbarHelpContainer.append(shortcuts);
        toolbarHelpContainer.append(github);

        // toolbar
        const toolbarContainer = new Container({
            id: 'toolbar-container'
        });
        toolbarContainer.append(toolbarToolsContainer);
        toolbarContainer.append(toolbarHelpContainer);

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
        const controlPanel = new ControlPanel(canvasContainer.dom, remoteStorageMode);

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

        editorContainer.append(toolbarContainer);
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
