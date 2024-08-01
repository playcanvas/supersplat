import { Container, Label } from 'pcui';

type MenuItemType = 'button' | 'menu' | 'separator';

type Direction = 'left' | 'right' | 'top' | 'bottom';

type MenuItem = {
    type?: MenuItemType;

    text?: string;
    icon?: string;
    shortcut?: string;
    menuPanel?: MenuPanel;

    onSelect?: () => void;
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

class MenuPanel extends Container {
    constructor(menuItems: MenuItem[], args = {}) {
        args = {
            ...args,
            class: 'menu-panel',
            hidden: true
        };

        super(args);

        this.on('hide', () => {
            for (let menuItem of menuItems) {
                if (menuItem.menuPanel) {
                    menuItem.menuPanel.hidden = true;
                }
            }
        });

        let deactivate: () => void | null = null;

        for (let menuItem of menuItems) {
            const type = menuItem.type ?? (menuItem.menuPanel ? 'menu' : menuItem.text ? 'button' : 'separator');

            let row: Container | null = null;
            let activate: () => void | null = null;
            switch (type) {
                case 'button': {
                    row = new Container({ class: 'menu-row' });
                    const icon = new Label({ class: 'menu-row-icon', text: menuItem.icon && String.fromCodePoint(parseInt(menuItem.icon, 16)) });
                    const text = new Label({ class: 'menu-row-text', text: menuItem.text });
                    const postscript = new Label({ class: 'menu-row-postscript', text: menuItem.shortcut });
                    row.append(icon);
                    row.append(text);
                    row.append(postscript);

                    row.dom.addEventListener('pointerdown', () => {
                        if (menuItem.onSelect) {
                            menuItem.onSelect();
                        }
                    });

                    row.dom.addEventListener('pointerup', () => {
                        if (menuItem.onSelect) {
                            menuItem.onSelect();
                        }
                    });

                    break;
                }

                case 'menu': {
                    row = new Container({ class: 'menu-row' });
                    const icon = new Label({ class: 'menu-row-icon', text: menuItem.icon &&String.fromCodePoint(parseInt(menuItem.icon, 16)) });
                    const text = new Label({ class: 'menu-row-text', text: menuItem.text });
                    const postscript = new Label({ class: 'menu-row-postscript', text: '\u232A' });
                    row.append(icon);
                    row.append(text);
                    row.append(postscript);

                    const childPanel = menuItem.menuPanel;
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

                this.append(row);
            }
        }
    }

    position(parent: HTMLElement, direction: Direction, padding = 2) {
        arrange(this.dom, parent, direction, padding);
    }
}

export { MenuPanel };
