import { Container, Element, Label } from '@playcanvas/pcui';

import { i18n } from './localization';

type Direction = 'left' | 'right' | 'top' | 'bottom';

type MenuItem = {
    // a resolver (() => string) makes the row re-localize on language change
    // and re-evaluate each time the panel is shown
    text?: string | (() => string);
    icon?: string | Element;
    extra?: string | Element;
    subMenu?: MenuPanel;

    isEnabled?: () => boolean | Promise<boolean>;
    isVisible?: () => boolean | Promise<boolean>;
    onSelect?: () => any;
};

const offsetParent = (elem: HTMLElement) : HTMLElement => {
    const parent = elem.parentNode as HTMLElement;

    return (parent.tagName === 'BODY' || window.getComputedStyle(parent).position !== 'static') ?
        parent :
        offsetParent(parent);
};

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
            style.left = `${rect.left - parentRect.left}px`;
            style.top = 'auto';
            style.bottom = `${parentRect.bottom - rect.top + padding}px`;
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

const createIcon = (icon: string | Element) => {
    return isString(icon) ?
        new Label({ class: 'menu-row-icon', text: icon && String.fromCodePoint(parseInt(icon as string, 16)) }) :
        icon;
};

// create the row text label; if `text` is a resolver, bind it so the row
// re-localizes when the language changes (auto-unbinds on label destroy)
const createTextLabel = (text: string | (() => string)) => {
    const label = new Label({ class: 'menu-row-text' });
    i18n.bindText(label, text);
    return label;
};

// Detect if we're on a touch device
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

class MenuPanel extends Container {
    parentPanel: MenuPanel | null = null;
    menuItems: MenuItem[] = [];
    // row text labels, so resolver text can be refreshed when the panel is shown
    private textLabels = new Map<MenuItem, Label>();

    constructor(menuItems: MenuItem[], args = {}) {
        args = {
            ...args,
            class: 'menu-panel',
            hidden: true
        };

        super(args);

        this.on('hide', () => {
            for (const menuItem of this.menuItems) {
                if (menuItem.subMenu) {
                    menuItem.subMenu.hidden = true;
                }
            }
        });

        this.on('show', async () => {
            for (let i = 0; i < this.menuItems.length; i++) {
                const menuItem = this.menuItems[i];
                if (typeof menuItem.text === 'function') {
                    this.textLabels.get(menuItem).text = menuItem.text();
                }
                if (menuItem.isEnabled) {
                    this.dom.children.item(i).ui.enabled = await menuItem.isEnabled();
                }
                if (menuItem.isVisible) {
                    this.dom.children.item(i).ui.hidden = !(await menuItem.isVisible());
                }
            }
        });

        this.setItems(menuItems);
    }

    setItems(menuItems: MenuItem[]) {
        this.menuItems = menuItems;
        this.textLabels.clear();
        this.clear();

        for (const menuItem of menuItems) {
            const type = menuItem.subMenu ? 'menu' : menuItem.text ? 'button' : 'separator';

            let row: Container | null = null;
            let activate: () => void | null = null;
            switch (type) {
                case 'button': {
                    row = new Container({ class: 'menu-row' });
                    const icon = createIcon(menuItem.icon);
                    const text = createTextLabel(menuItem.text);
                    this.textLabels.set(menuItem, text);
                    const postscript = isString(menuItem.extra) ? new Label({ class: 'menu-row-postscript', text: menuItem.extra as string }) : menuItem.extra;
                    row.append(icon);
                    row.append(text);
                    row.append(postscript);

                    break;
                }

                case 'menu': {
                    row = new Container({ class: 'menu-row' });
                    const icon = createIcon(menuItem.icon);
                    const text = createTextLabel(menuItem.text);
                    this.textLabels.set(menuItem, text);
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

                // For desktop: use hover behavior
                if (!isTouchDevice) {
                    row.dom.addEventListener('pointerenter', () => {
                        timer = window.setTimeout(() => {
                            // only the hovered row's submenu stays open
                            this.hideSubMenus(menuItem.subMenu);
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
                }

                row.dom.addEventListener('pointerdown', (event: PointerEvent) => {
                    event.stopPropagation();
                });

                row.dom.addEventListener('pointerup', (event: PointerEvent) => {
                    event.stopPropagation();

                    if (!row.disabled) {
                        // Handle submenu items differently on touch devices
                        if (menuItem.subMenu) {
                            if (isTouchDevice) {
                                // On touch devices: tap to open/close submenu
                                if (menuItem.subMenu.hidden) {
                                    // Close other submenus in this panel first
                                    this.hideSubMenus(menuItem.subMenu);
                                    if (activate) {
                                        activate();
                                    }
                                } else {
                                    // Close the submenu if it's already open
                                    menuItem.subMenu.hidden = true;
                                }
                            }
                            // On desktop, submenus are handled by hover, so don't close the root panel
                        } else if (menuItem.onSelect) {
                            // Regular menu item: execute action and close menu
                            this.rootPanel.hidden = true;
                            menuItem.onSelect();
                        }
                    }
                });

                this.append(row);
            }
        }
    }

    // hide this panel's submenus, except the one to keep open
    hideSubMenus(keep?: MenuPanel) {
        for (const menuItem of this.menuItems) {
            if (menuItem.subMenu && menuItem.subMenu !== keep) {
                menuItem.subMenu.hidden = true;
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

export { MenuItem, MenuPanel };
