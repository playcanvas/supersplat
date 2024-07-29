import { Container, Label, Element as PcuiElement } from 'pcui';
import { Events } from '../events';
import { Splat } from '../splat';
import { Element, ElementType } from '../element';

class SplatItem extends Container {
    getSelected: () => boolean;
    setSelected: (value: boolean) => void;
    getVisible: () => boolean;
    setVisible: (value: boolean) => void;
    destroy: () => void;

    constructor(name: string, args = {}) {
        args = {
            ...args,
            class: ['splat-item', 'visible']
        };

        super(args);

        const text = new Label({
            class: 'splat-item-text',
            text: name
        });

        const visible = new PcuiElement({
            class: 'splat-item-visible',
        });

        const remove = new PcuiElement({
            class: 'splat-item-delete'
        });

        this.append(text);
        this.append(visible);
        this.append(remove);

        this.getSelected = () => {
            return this.class.contains('selected');
        };

        this.setSelected = (value: boolean) => {
            if (value !== this.selected) {
                if (value) {
                    this.class.add('selected');
                    this.emit('select', this);
                } else {
                    this.class.remove('selected');
                    this.emit('unselect', this);
                }
            }
        };

        this.getVisible = () => {
            return this.class.contains('visible');
        };

        this.setVisible = (value: boolean) => {
            if (value !== this.visible) {
                if (value) {
                    this.class.add('visible');
                    this.emit('visible', this);
                } else {
                    this.class.remove('visible');
                    this.emit('invisible', this);
                }
            }
        };

        const toggleVisible = (event: MouseEvent) => {
            event.stopPropagation();
            this.visible = !this.visible;
        };

        const handleRemove = (event: MouseEvent) => {
            event.stopPropagation();
            this.emit('removeClicked', this);
        };

        // handle clicks
        visible.dom.addEventListener('click', toggleVisible, true);
        remove.dom.addEventListener('click', handleRemove, true);

        this.destroy = () => {
            visible.dom.removeEventListener('click', toggleVisible, true);
            remove.dom.removeEventListener('click', handleRemove, true);
        }
    }

    get selected() {
        return this.getSelected();
    }

    set selected(value) {
        this.setSelected(value);
    }

    get visible() {
        return this.getVisible();
    }

    set visible(value) {
        this.setVisible(value);
    }
}

class SplatList extends Container {
    constructor(events: Events, args = {}) {
        args = {
            ...args,
            class: 'splat-list'
        };

        super(args);

        const items = new Map<Splat, SplatItem>();

        events.on('scene.elementAdded', (element: Element) => {
            if (element.type === ElementType.splat) {
                const splat = element as Splat;
                const item = new SplatItem(splat.filename);
                this.append(item);
                items.set(splat, item);

                item.on('visible', () => {
                    splat.visible = true;

                    // also select it if there is no other selection
                    if (!events.invoke('selection')) {
                        events.fire('selection', splat);
                    }
                });
                item.on('invisible', () => splat.visible = false);
            }
        });

        events.on('scene.elementRemoved', (element: Element) => {
            if (element.type === ElementType.splat) {
                const splat = element as Splat;
                const item = items.get(splat);
                if (item) {
                    this.remove(item);
                    items.delete(splat);
                }
            }
        });

        events.on('selection.changed', (selection: Splat) => {
            items.forEach((value, key) => {
                value.selected = key === selection;
            });
        });

        events.on('splat.vis', (splat: Splat) => {
            const item = items.get(splat);
            if (item) {
                item.visible = splat.visible;
            }
        });

        this.on('click', (item: SplatItem) => {
            for (const [key, value] of items) {
                if (item === value) {
                    events.fire('selection', key);
                    break;
                }
            }            
        });

        this.on('removeClicked', async (item: SplatItem) => {
            let splat;
            for (const [key, value] of items) {
                if (item === value) {
                    splat = key;
                    break;
                }
            }  

            if (!splat) {
                return;
            }

            const result = await events.invoke('showPopup', {
                type: 'yesno',
                message: `Would you like to remove '${splat.filename}' from the scene?`
            });

            if (result?.action === 'yes') {
                splat.destroy();
            }
        });
    }

    protected _onAppendChild(element: Element): void {
        super._onAppendChild(element);

        if (element instanceof SplatItem) {
            element.on('click', () => {
                this.emit('click', element);
            });

            element.on('removeClicked', () => {
                this.emit('removeClicked', element);
            });
        }
    }

    protected _onRemoveChild(element: Element): void {
        if (element instanceof SplatItem) {
            element.unbind('click');
            element.unbind('removeClicked');
        }

        super._onRemoveChild(element);
    }
}

export { SplatList, SplatItem };
