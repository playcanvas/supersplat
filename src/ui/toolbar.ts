import { Button, Container } from 'pcui';
import logo from './playcanvas-logo.png';
import { ShortcutsPopup } from './shortcuts';

class Toolbar extends Container {
    constructor(appContainer: Container, args = {}) {
        args = Object.assign(args, {
            id: 'toolbar-container'
        });

        super(args);

        // toolbar-tools
        const toolbarToolsContainer = new Container({
            id: 'toolbar-tools-container'
        });

        // logo
        const appLogo = document.createElement('img');
        appLogo.classList.add('toolbar-button');
        appLogo.id = 'app-logo';
        appLogo.src = logo.src;

        // move
        const moveTool = new Button({
            id: 'move-tool',
            class: 'toolbar-button',
            icon: 'E111'
        });

        // scale
        const scaleTool = new Button({
            id: 'scale-tool',
            class: 'toolbar-button',
            icon: 'E112'
        });

        // rotate
        const rotateTool = new Button({
            id: 'rotate-tool',
            class: 'toolbar-button',
            icon: 'E113'
        });

        // brush selection
        const brushTool = new Button({
            id: 'brush-tool',
            class: 'toolbar-button',
            icon: 'E114'
        });

        // rect selection
        const rectTool = new Button({
            id: 'rect-tool',
            class: 'toolbar-button',
            icon: 'E115'
        });

        toolbarToolsContainer.dom.appendChild(appLogo);
        toolbarToolsContainer.append(moveTool);
        toolbarToolsContainer.append(scaleTool);
        toolbarToolsContainer.append(rotateTool);
        toolbarToolsContainer.append(brushTool);
        toolbarToolsContainer.append(rectTool);

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
            window.open('https://github.com/playcanvas/super-splat', '_blank').focus();
        });

        // keyboard shortcuts
        const shortcutsPopup = new ShortcutsPopup();

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

        this.append(toolbarToolsContainer);
        this.append(toolbarHelpContainer);
    }
}

export { Toolbar };
