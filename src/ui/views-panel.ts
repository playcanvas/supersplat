import { Button, Container, Label, TextInput } from '@playcanvas/pcui';

import { Events } from '../events';
import { View } from '../view-manager';
import deleteSvg from './svg/delete.svg';

const createSvg = (svgString: string) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

class ViewsPanel extends Container {
    constructor(events: Events, args = {}) {
        args = {
            ...args,
            id: 'views-panel'
        };

        super(args);

        const header = new Container({
            class: 'views-panel-header'
        });

        const headerLabel = new Label({
            text: 'View Angles',
            class: 'views-panel-header-label'
        });

        header.append(headerLabel);

        const listContainer = new Container({
            class: 'views-list-container'
        });

        const createButton = new Button({
            text: 'Create View +',
            class: 'views-create-button'
        });

        createButton.on('click', () => {
            events.invoke('views.add');
        });

        this.append(header);
        this.append(listContainer);
        this.append(createButton);

        const rebuildList = (views: View[]) => {
            listContainer.clear();

            views.forEach((view, index) => {
                const row = new Container({
                    class: 'views-list-item'
                });

                const dragHandle = new Label({
                    text: '\u2237',
                    class: 'views-item-drag'
                });

                const nameLabel = new Label({
                    text: view.name,
                    class: 'views-item-name'
                });

                nameLabel.on('click', () => {
                    events.invoke('views.goto', index);
                });

                const editButton = new Button({
                    text: 'Edit',
                    class: 'views-item-edit'
                });

                let activeInput: TextInput | null = null;

                const cleanupEdit = () => {
                    if (activeInput) {
                        activeInput.dom.remove();
                        activeInput.destroy();
                        activeInput = null;
                        nameLabel.hidden = false;
                    }
                };

                editButton.on('click', () => {
                    if (activeInput) return;

                    const input = new TextInput({
                        value: view.name,
                        class: 'views-item-name-input'
                    });
                    activeInput = input;

                    nameLabel.hidden = true;
                    row.dom.insertBefore(input.dom, editButton.dom);

                    const finishEdit = () => {
                        if (activeInput !== input) return;
                        const newName = input.value.trim();
                        if (newName && newName !== view.name) {
                            cleanupEdit();
                            events.invoke('views.rename', index, newName);
                        } else {
                            cleanupEdit();
                        }
                    };

                    input.dom.querySelector('input')?.focus();
                    input.dom.querySelector('input')?.select();

                    input.dom.addEventListener('keydown', (e: KeyboardEvent) => {
                        if (e.key === 'Enter') {
                            finishEdit();
                        } else if (e.key === 'Escape') {
                            cleanupEdit();
                        }
                    });

                    input.dom.addEventListener('focusout', () => {
                        finishEdit();
                    });
                });

                const deleteButton = new Button({
                    class: 'views-item-delete'
                });

                deleteButton.dom.appendChild(createSvg(deleteSvg));

                deleteButton.on('click', () => {
                    events.invoke('views.remove', index);
                });

                row.append(dragHandle);
                row.append(nameLabel);
                row.append(editButton);
                row.append(deleteButton);

                listContainer.append(row);
            });
        };

        events.on('views.changed', (views: View[]) => {
            rebuildList(views);
        });
    }
}

export { ViewsPanel };
