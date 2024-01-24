import { Button, Container } from 'pcui';
import { ShortcutsPopup } from './shortcuts';
import { Events } from '../events';
import logo from './playcanvas-logo.png';

class Toolbar extends Container {
    constructor(events: Events, appContainer: Container, args = {}) {
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
        moveTool.on('click', () => {
            events.fire('tool:activate', 'Move');
        });

        // rotate
        const rotateTool = new Button({
            id: 'rotate-tool',
            class: 'toolbar-button',
            icon: 'E113'
        });
        rotateTool.on('click', () => {
            events.fire('tool:activate', 'Rotate');
        });

        // scale
        const scaleTool = new Button({
            id: 'scale-tool',
            class: 'toolbar-button',
            icon: 'E112'
        });
        scaleTool.on('click', () => {
            events.fire('tool:activate', 'Scale');
        });

        // rect selection
        const rectTool = new Button({
            id: 'rect-tool',
            class: 'toolbar-button',
            icon: 'E135'
        });
        rectTool.on('click', () => {
            events.fire('tool:activate', 'RectSelection');
        });

        // brush selection
        const brushTool = new Button({
            id: 'brush-tool',
            class: 'toolbar-button',
            icon: 'E195'
        });
        brushTool.on('click', () => {
            events.fire('tool:activate', 'BrushSelection');
        });

        events.on('tool:activated', (toolName: string) => {
            moveTool.class[toolName === 'Move' ? 'add' : 'remove']('active');
            rotateTool.class[toolName === 'Rotate' ? 'add' : 'remove']('active');
            scaleTool.class[toolName === 'Scale' ? 'add' : 'remove']('active');
            rectTool.class[toolName === 'RectSelection' ? 'add' : 'remove']('active');
            brushTool.class[toolName === 'BrushSelection' ? 'add' : 'remove']('active');
        });

        toolbarToolsContainer.dom.appendChild(appLogo);
        toolbarToolsContainer.append(moveTool);
        toolbarToolsContainer.append(rotateTool);
        toolbarToolsContainer.append(scaleTool);
        toolbarToolsContainer.append(rectTool);
        toolbarToolsContainer.append(brushTool);

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
