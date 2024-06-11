import { Button, Container, Element, Menu } from 'pcui';
import { ShortcutsPopup } from './shortcuts-popup';
import { Tooltip } from './tooltip';
import { Events } from '../events';
import logo from './playcanvas-logo.png';

class Toolbar extends Container {
    constructor(events: Events, appContainer: Container, tooltipsContainer: Container, args = {}) {
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

        // file
        const fileButton = new Button({
            id: 'file-menu-button',
            class: 'toolbar-button',
            icon: 'E220'
        });

        const fileMenu = new Menu({
            id: 'file-menu',
            items: [{
                class: 'file-menu-item',
                text: 'New',
                icon: 'E208',
                onSelect: () => events.fire('scene.new')
            }, {
                class: 'file-menu-item',
                text: 'Open...',
                icon: 'E226',
                onSelect: () => events.fire('scene.open')
            }, {
                class: 'file-menu-item',
                text: 'Save',
                icon: 'E216',
                onSelect: () => events.fire('scene.save'),
                onIsEnabled: () => events.invoke('scene.canSave')
            }, {
                class: 'file-menu-item',
                text: 'Save As...',
                icon: 'E216',
                onSelect: () => events.fire('scene.saveAs'),
                onIsEnabled: () => events.invoke('scene.canSave')
            }, {
                class: 'file-menu-item',
                text: 'Export',
                icon: 'E225',
                onIsEnabled: () => events.invoke('scene.canSave'),
                items: [{
                    class: 'file-menu-item',
                    text: 'Compressed Ply',
                    icon: 'E245',
                    onSelect: () => events.invoke('scene.export', 'compressed-ply')
                }, {
                    class: 'file-menu-item',
                    text: 'Splat file',
                    icon: 'E245',
                    onSelect: () => events.invoke('scene.export', 'splat')
                }]
            }]
        });

        fileButton.on('click', () => {
            const r = fileButton.dom.getBoundingClientRect();
            fileMenu.position(r.right, r.top);
            fileMenu.hidden = false;
        });

        window.addEventListener('click', (e: Event) => {
            if (!fileMenu.hidden &&
                !fileMenu.dom.contains(e.target as Node) &&
                e.target !== fileButton.dom) {
                fileMenu.hidden = true;
            }
        });

        // move
        const moveTool = new Button({
            id: 'move-tool',
            class: 'toolbar-button',
            icon: 'E111'
        });
        moveTool.on('click', () => {
            events.fire('tool.move');
        });

        // rotate
        const rotateTool = new Button({
            id: 'rotate-tool',
            class: 'toolbar-button',
            icon: 'E113'
        });
        rotateTool.on('click', () => {
            events.fire('tool.rotate');
        });

        // scale
        const scaleTool = new Button({
            id: 'scale-tool',
            class: 'toolbar-button',
            icon: 'E112'
        });
        scaleTool.on('click', () => {
            events.fire('tool.scale');
        });

        // world/local space toggle
        const coordSpaceToggle = new Button({
            id: 'coord-space-toggle',
            class: 'toolbar-button',
            icon: 'E118'
        });

        coordSpaceToggle.on('click', () => {
            events.fire('tool.toggleCoordSpace');
        });

        events.on('tool.coordSpace', (space: 'local' | 'world') => {
            coordSpaceToggle.dom.classList[space === 'world' ? 'add' : 'remove']('active');
        });

        /* disable rect and brush selection on the toolbar till we have a
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
        */

        events.on('tool.activated', (toolName: string) => {
            moveTool.class[toolName === 'move' ? 'add' : 'remove']('active');
            rotateTool.class[toolName === 'rotate' ? 'add' : 'remove']('active');
            scaleTool.class[toolName === 'scale' ? 'add' : 'remove']('active');
            // rectTool.class[toolName === 'RectSelection' ? 'add' : 'remove']('active');
            // brushTool.class[toolName === 'BrushSelection' ? 'add' : 'remove']('active');
        });

        toolbarToolsContainer.dom.appendChild(appLogo);
        toolbarToolsContainer.append(fileButton);
        toolbarToolsContainer.append(fileMenu);
        toolbarToolsContainer.append(moveTool);
        toolbarToolsContainer.append(rotateTool);
        toolbarToolsContainer.append(scaleTool);
        toolbarToolsContainer.append(coordSpaceToggle);
        // toolbarToolsContainer.append(rectTool);
        // toolbarToolsContainer.append(brushTool);

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

        // github
        const github = new Button({
            class: 'toolbar-button',
            icon: 'E259' 
        });
        github.on('click', () => {
            window.open('https://github.com/playcanvas/supersplat', '_blank').focus();
        });

        // toolbar help toolbar
        const toolbarHelpContainer = new Container({
            id: 'toolbar-help-container'
        });
        toolbarHelpContainer.append(shortcuts);
        toolbarHelpContainer.append(github);

        this.append(toolbarToolsContainer);
        this.append(toolbarHelpContainer);

        const addTooltip = (target: Element, text: string) => {
            const tooltip = new Tooltip({ target, text });
            tooltipsContainer.append(tooltip);
            return tooltip;
        };

        // add tooltips
        addTooltip(moveTool, 'Move');
        addTooltip(rotateTool, 'Rotate');
        addTooltip(scaleTool, 'Scale');
        const coordSpaceTooltip = addTooltip(coordSpaceToggle, 'Local Space');
        addTooltip(shortcuts, 'Keyboard Shortcuts');
        addTooltip(github, 'GitHub Repo');

        // update tooltip
        events.on('tool.coordSpace', (space: 'local' | 'world') => {
            const spaces = {
                local: 'Local',
                world: 'World'
            };
            coordSpaceTooltip.content.text = `${spaces[space]} Space`;
        });
    }
}

export { Toolbar };
