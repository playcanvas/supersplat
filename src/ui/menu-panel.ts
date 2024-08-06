import { Container, Element, Label, Menu } from 'pcui';

type Direction = 'left' | 'right' | 'top' | 'bottom';

type MenuItem = {
    text?: string;
    icon?: string | Element;
    extra?: string | Element;
    subMenu?: MenuPanel;

    onSelect?: () => any;
    isEnabled?: () => boolean;
};

const offsetParent = (elem: HTMLElement) : HTMLElement => {
    const parent = elem.parentNode as HTMLElement;

    return (parent.tagName === 'BODY' || window.getComputedStyle(parent).position !== 'static') ?
        parent :
            offsetParent(parent);
}

const arrange = (element: HTMLElement, target: HTMLElement, direction: Direction, padding: number) => {
    const rect = target.getBoundingClientRect();
    const parentRect = offsetParent(element).getBoundingClientRect();

    const style = element.style;
    switch (direction) {
        case 'left':
            break;
        case 'right':
            style.left = `${rect.right - parentRect.left + padding}px`;
            style.top = `${rect.top - parentRect.top}px`;
            break;
        case 'top':
            break;
        case 'bottom':
            style.left = `${rect.left - parentRect.left}px`;
            style.top = `${rect.bottom - parentRect.top + padding}px`;
            break;
    }
};

const isString = (value: any) => {
    return !value || typeof value === 'string' || value instanceof String;
};

class MenuPanel extends Container {
    parentPanel: MenuPanel | null = null;

    constructor(menuItems: MenuItem[], args = {}) {
        args = {
            ...args,
            class: 'menu-panel',
            hidden: true
        };

        super(args);

        this.on('hide', () => {
            for (const menuItem of menuItems) {
                if (menuItem.subMenu) {
                    menuItem.subMenu.hidden = true;
                }
            }
        });

        this.on('show', () => {
            for (let i = 0; i < menuItems.length; i++) {
                const menuItem = menuItems[i];
                if (menuItem.isEnabled) {
                    this.dom.children.item(i).ui.enabled = menuItem.isEnabled();
                }
            }
        });

        let deactivate: () => void | null = null;

        for (const menuItem of menuItems) {
            const type = menuItem.subMenu ? 'menu' : menuItem.text ? 'button' : 'separator';

            const createIcon = (icon: string | Element) => {
                return isString(menuItem.icon) ?
                    new Label({ class: 'menu-row-icon', text: menuItem.icon && String.fromCodePoint(parseInt(menuItem.icon as string, 16)) }) :
                        menuItem.icon;
            };

            let row: Container | null = null;
            let activate: () => void | null = null;
            switch (type) {
                case 'button': {
                    row = new Container({ class: 'menu-row' });
                    const icon = createIcon(menuItem.icon);
                    const text = new Label({ class: 'menu-row-text', text: menuItem.text });
                    const postscript = isString(menuItem.extra) ? new Label({ class: 'menu-row-postscript', text: menuItem.extra as string }) : menuItem.extra;
                    row.append(icon);
                    row.append(text);
                    row.append(postscript);

                    break;
                }

                case 'menu': {
                    row = new Container({ class: 'menu-row' });
                    const icon = createIcon(menuItem.icon);
                    const text = new Label({ class: 'menu-row-text', text: menuItem.text });
                    const postscript = new Label({ class: 'menu-row-postscript', text: '\u232A' });
                    row.append(icon);
                    row.append(text);
                    row.append(postscript);

                    // set parent panel
                    menuItem.subMenu.parentPanel = this;

                    const childPanel = menuItem.subMenu;
                    if (childPanel) {
                        activate = () => {
                            if (childPanel.hidden) {
                                childPanel.position(row.dom, 'right', 2);
                                childPanel.hidden = !childPanel.hidden;
                            }

                            deactivate = () => {
                                childPanel.hidden = true;
                            };
                        };
                    }

                    break;
                }

                case 'separator':
                    this.append(new Container({ class: 'menu-row-separator' }));
                    break;
            }

            if (row) {
                let timer = -1;

                row.dom.addEventListener('pointerenter', () => {
                    timer = setTimeout(() => {
                        if (deactivate) {
                            deactivate();
                        }
                        if (activate) {
                            activate();
                        }
                    }, 250);
                });

                row.dom.addEventListener('pointerleave', () => {
                    if (timer !== -1) {
                        clearTimeout(timer);
                        timer = -1;
                    }
                });

                row.dom.addEventListener('pointerdown', (event: PointerEvent) => {
                    event.stopPropagation();
                });

                row.dom.addEventListener('pointerup', (event: PointerEvent) => {
                    event.stopPropagation();

                    if (!row.disabled && menuItem.onSelect) {
                        this.rootPanel.hidden = true;
                        menuItem.onSelect();
                    }
                });

                this.append(row);
            }
        }
    }

    get rootPanel() {
        // eslint-disable-next-line  @typescript-eslint/no-this-alias
        let panel: MenuPanel = this;
        while (panel.parentPanel) {
            panel = panel.parentPanel;
        }
        return panel;
    }

    position(parent: HTMLElement, direction: Direction, padding = 2) {
        arrange(this.dom, parent, direction, padding);
    }
}

export { MenuPanel };
