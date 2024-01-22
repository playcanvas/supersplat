import { Button, Container, Label, Overlay, Panel } from 'pcui';
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

class Toolbar extends Container {
    constructor(appContainer: Container, args = {}) {
        Object.assign(args, {
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

        toolbarToolsContainer.dom.appendChild(appLogo);
        toolbarToolsContainer.append(moveTool);
        toolbarToolsContainer.append(scaleTool);
        toolbarToolsContainer.append(rotateTool);

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
    }
}

export { Toolbar };
