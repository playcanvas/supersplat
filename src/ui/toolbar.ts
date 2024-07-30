import { Button, Container, Element, Menu } from 'pcui';
import { Tooltip } from './tooltip';
import { Events } from '../events';
import logo from './playcanvas-logo.png';

class Toolbar extends Container {
    constructor(events: Events, appContainer: Container, tooltipsContainer: Container, args = {}) {
        args = {
            ...args,
            id: 'toolbar-container'
        };

        super(args);

        // toolbar-tools
        const toolbarToolsContainer = new Container({
            id: 'toolbar-tools-container'
        });

        // logo
        const appLogo = document.createElement('img');
        appLogo.classList.add('toolbar-button');
        appLogo.id = 'app-logo';
        appLogo.src = logo;

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
                onSelect: () => events.invoke('scene.new')
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
                onIsEnabled: () => events.invoke('scene.empty')
            }, {
                class: 'file-menu-item',
                text: 'Save As...',
                icon: 'E216',
                onSelect: () => events.fire('scene.saveAs'),
                onIsEnabled: () => events.invoke('scene.empty')
            }, {
                class: 'file-menu-item',
                text: 'Export',
                icon: 'E225',
                onIsEnabled: () => events.invoke('scene.empty'),
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

        toolbarToolsContainer.dom.appendChild(appLogo);
        toolbarToolsContainer.append(fileButton);
        toolbarToolsContainer.append(fileMenu);
        toolbarToolsContainer.append(coordSpaceToggle);

        // keyboard shortcuts
        const shortcuts = new Button({
            class: 'toolbar-button',
            icon: 'E136'
        });
        shortcuts.on('click', () => {
            events.fire('show.shortcuts');
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
