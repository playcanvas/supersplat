import { Button, Container, Menu as PcuiMenu } from 'pcui';
import { Events } from '../events';
import { version } from '../../package.json';

import logoSvg from '../svg/playcanvas-logo.svg';

class Menu extends Container {
    constructor(events: Events, args = {}) {
        args = {
            ...args,
            id: 'menu'
        };

        super(args);

        const handleDown = (event: PointerEvent) => {
            event.preventDefault();
            event.stopPropagation();
        };

        this.dom.addEventListener('pointerdown', (event) => {
            handleDown(event);
        });

        const icon = document.createElement('img');
        icon.setAttribute('id', 'menu-icon');
        icon.src = logoSvg;

        const scene = new Button({
            text: 'Scene',
            class: 'menu-button'
        });

        const selection = new Button({
            text: 'Selection',
            class: 'menu-button'
        });

        const help = new Button({
            text: 'Help',
            class: 'menu-button'
        });

        this.dom.appendChild(icon);
        this.append(scene);
        this.append(selection);
        this.append(help);

        const sceneMenu = new PcuiMenu({
            id: 'menu-dropdown',
            items: [{
                class: 'menu-dropdown-item',
                text: 'New',
                icon: 'E208',
                onSelect: () => events.fire('scene.new')
            }, {
                class: 'menu-dropdown-item',
                text: 'Open...',
                icon: 'E226',
                onSelect: () => events.fire('scene.open')
            }, {
                class: 'menu-dropdown-item',
                text: 'Save',
                icon: 'E216',
                onSelect: () => events.fire('scene.save'),
                onIsEnabled: () => events.invoke('scene.canSave')
            }, {
                class: 'menu-dropdown-item',
                text: 'Save As...',
                icon: 'E216',
                onSelect: () => events.fire('scene.saveAs'),
                onIsEnabled: () => events.invoke('scene.canSave')
            }, {
                class: 'menu-dropdown-item',
                text: 'Export',
                icon: 'E225',
                onIsEnabled: () => events.invoke('scene.canSave'),
                items: [{
                    class: 'menu-dropdown-item',
                    text: 'Compressed Ply',
                    icon: 'E245',
                    onSelect: () => events.invoke('scene.export', 'compressed-ply')
                }, {
                    class: 'menu-dropdown-item',
                    text: 'Splat file',
                    icon: 'E245',
                    onSelect: () => events.invoke('scene.export', 'splat')
                }]
            }, {
                class: 'menu-dropdown-item',
                text: `SUPERSPLAT v${version}`,
                icon: 'E0020',
                enabled: false
            }]
        });

        const selectionMenu = new PcuiMenu({
            id: 'menu-dropdown',
            items: [{
                class: 'menu-dropdown-item',
                text: 'Select All',
                icon: 'E0020',
                onSelect: () => events.fire('selection.all')
            }, {
                class: 'menu-dropdown-item',
                text: 'Select None',
                icon: 'E0020',
                onSelect: () => events.fire('selection.none')
            }, {
                class: 'menu-dropdown-item',
                text: 'Invert Selection',
                icon: 'E0020',
                onSelect: () => events.fire('selection.invert')
            }]
        });

        const helpMenu = new PcuiMenu({
            id: 'menu-dropdown',
            items: [{
                class: 'menu-dropdown-item',
                text: 'About SuperSplat',
                icon: 'E138',
                onSelect: () => events.fire('show.about')
            }, {
                class: 'menu-dropdown-item',
                text: 'Keyboard Shortcuts',
                icon: 'E136',
                onSelect: () => events.fire('show.shortcuts')
            }, {
                class: 'menu-dropdown-item',
                text: 'GitHub Repo',
                icon: 'E259',
                onSelect: () => window.open('https://github.com/playcanvas/supersplat', '_blank').focus()
            }]
        });

        this.append(sceneMenu);
        this.append(selectionMenu);
        this.append(helpMenu);

        scene.on('click', () => {
            const r = scene.dom.getBoundingClientRect();
            sceneMenu.position(r.left, r.bottom + 8);
            sceneMenu.hidden = false;
        });

        selection.on('click', () => {
            const r = selection.dom.getBoundingClientRect();
            selectionMenu.position(r.left, r.bottom + 8);
            selectionMenu.hidden = false;
        });

        help.on('click', () => {
            const r = help.dom.getBoundingClientRect();
            helpMenu.position(r.left, r.bottom + 8);
            helpMenu.hidden = false;
        });

        window.addEventListener('click', (e: Event) => {
            if (!sceneMenu.hidden &&
                !sceneMenu.dom.contains(e.target as Node) &&
                e.target !== scene.dom) {
                sceneMenu.hidden = true;
            }

            if (!selectionMenu.hidden &&
                !selectionMenu.dom.contains(e.target as Node) &&
                e.target !== selection.dom) {
                    selectionMenu.hidden = true;
            }

            if (!helpMenu.hidden &&
                !helpMenu.dom.contains(e.target as Node) &&
                e.target !== help.dom) {
                helpMenu.hidden = true;
            }
        });
    }
}

export { Menu };
