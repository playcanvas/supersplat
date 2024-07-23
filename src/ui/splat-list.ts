import { Container, Label, Element } from 'pcui';

class SplatItem extends Container {
    getSelected: () => boolean;
    setSelected: (value: boolean) => void;
    getVisible: () => boolean;
    setVisible: (value: boolean) => void;
    destroy: () => void;

    constructor(name: string, args = {}) {
        args = {
            ...args,
            class: 'scene-panel-splat-item'
        };

        super(args);

        const text = new Label({
            class: 'scene-panel-splat-item-text',
            text: name
        });

        const visible = new Element({
            class: ['scene-panel-splat-item-visible', 'checked']
        });

        const remove = new Element({
            class: 'scene-panel-splat-item-delete'
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
            return visible.class.contains('checked');
        };

        this.setVisible = (value: boolean) => {
            if (value !== this.visible) {
                if (value) {
                    visible.class.add('checked');
                    this.emit('visible', this);
                } else {
                    visible.class.remove('checked');
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
