import { Container, Label } from 'pcui';
import { Events } from '../events';
import { MenuPanel } from './menu-panel';

import logoSvg from '../svg/playcanvas-logo.svg';

class Menu extends Container {
    constructor(events: Events, args = {}) {
        args = {
            ...args,
            id: 'menu',
            class: 'unselectable'
        };

        super(args);

        const menubar = new Container({
            id: 'menu-bar'
        });

        menubar.dom.addEventListener('pointerdown', (event) => {
            event.stopPropagation();
        });

        const icon = document.createElement('img');
        icon.setAttribute('id', 'menu-icon');
        icon.src = logoSvg;

        const scene = new Label({
            text: 'Scene',
            class: 'menu-option'
        });

        const selection = new Label({
            text: 'Selection',
            class: 'menu-option'
        });

        const help = new Label({
            text: 'Help',
            class: 'menu-option'
        });

        const buttonsContainer = new Container({
            id: 'menu-options-container'
        });
        buttonsContainer.append(scene);
        buttonsContainer.append(selection);
        buttonsContainer.append(help);

        menubar.dom.appendChild(icon);
        menubar.append(buttonsContainer);
        // menubar.append(title);

        const exportMenuPanel = new MenuPanel([{
            text: 'Compressed Ply',
            icon: 'E245',
            onSelect: () => events.invoke('scene.export', 'compressed-ply')
        }, {
            text: 'Splat file',
            icon: 'E245',
            onSelect: () => events.invoke('scene.export', 'splat')
        }]);

        const sceneMenuPanel = new MenuPanel([{
            text: 'New',
            icon: 'E208',
            onSelect: () => events.invoke('scene.new')
        }, {
            text: 'Open',
            icon: 'E226',
            onSelect: async () => {
                if (await events.invoke('scene.new')) {
                    events.fire('scene.open');
                }
            }
        }, {
            text: 'Import',
            icon: 'E245',
            onSelect: () => events.fire('scene.open')
        }, {
            // separator
        }, {
            text: 'Save',
            icon: 'E216',
            onSelect: () => events.fire('scene.save'),
            isEnabled: () => !events.invoke('scene.empty')
        }, {
            text: 'Save As...',
            icon: 'E216',
            onSelect: () => events.fire('scene.saveAs'),
            isEnabled: () => !events.invoke('scene.empty')
        }, {
            type: 'menu',
            text: 'Export',
            icon: 'E225',
            menuPanel: exportMenuPanel,
            isEnabled: () => !events.invoke('scene.empty'),
        }]);

        const selectionMenuPanel = new MenuPanel([{
            text: 'All',
            icon: 'E0020',
            onSelect: () => events.fire('select.all')
        }, {
            text: 'None',
            icon: 'E0020',
            onSelect: () => events.fire('select.none')
        }, {
            text: 'Invert',
            icon: 'E0020',
            onSelect: () => events.fire('select.invert')
        }]);

        const helpMenuPanel = new MenuPanel([{
            text: 'About SuperSplat',
            icon: 'E138',
            onSelect: () => events.fire('show.about')
        }, {
            text: 'Keyboard Shortcuts',
            icon: 'E136',
            onSelect: () => events.fire('show.shortcuts')
        }, {
            text: 'GitHub Repo',
            icon: 'E259',
            onSelect: () => window.open('https://github.com/playcanvas/supersplat', '_blank').focus()
        }]);

        this.append(menubar);
        this.append(sceneMenuPanel);
        this.append(exportMenuPanel);
        this.append(selectionMenuPanel);
        this.append(helpMenuPanel);

        const options: { dom: HTMLElement, menuPanel: MenuPanel }[] = [{
            dom: scene.dom,
            menuPanel: sceneMenuPanel
        }, {
            dom: selection.dom,
            menuPanel: selectionMenuPanel
        }, {
            dom: help.dom,
            menuPanel: helpMenuPanel
        }];

        options.forEach((option) => {
            const activate = () => {
                option.menuPanel.position(option.dom, 'bottom', 2);
                options.forEach(opt => opt.menuPanel.hidden = opt !== option);
            };

            option.dom.addEventListener('pointerdown', (event: PointerEvent) => {
                if (!option.menuPanel.hidden) {
                    option.menuPanel.hidden = true;
                } else {
                    activate();
                }
            });

            option.dom.addEventListener('pointerenter', (event: PointerEvent) => {
                if (!options.every(opt => opt.menuPanel.hidden)) {
                    activate();
                }
            });
        });

        const checkEvent = (event: PointerEvent) => {
            if (!this.dom.contains(event.target as Node)) {
                options.forEach(opt => opt.menuPanel.hidden = true);
            }
        };

        window.addEventListener('pointerdown', checkEvent, true);
        window.addEventListener('pointerup', checkEvent, true);
    }
}

export { Menu };
