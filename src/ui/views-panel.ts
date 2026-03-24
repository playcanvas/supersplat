import { Button, Container, Label, TextInput } from '@playcanvas/pcui';

import { Events } from '../events';
import { View } from '../view-manager';

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

                editButton.on('click', () => {
                    // Replace name label with text input for inline editing
                    const input = new TextInput({
                        value: view.name,
                        class: 'views-item-name-input'
                    });

                    nameLabel.hidden = true;
                    row.dom.insertBefore(input.dom, editButton.dom);

                    const finishEdit = () => {
                        const newName = input.value.trim();
                        if (newName && newName !== view.name) {
                            events.invoke('views.rename', index, newName);
                        } else {
                            nameLabel.hidden = false;
                            input.destroy();
                        }
                    };

                    input.dom.querySelector('input')?.focus();
                    input.dom.querySelector('input')?.select();

                    input.dom.addEventListener('keydown', (e: KeyboardEvent) => {
                        if (e.key === 'Enter') {
                            finishEdit();
                        } else if (e.key === 'Escape') {
                            nameLabel.hidden = false;
                            input.destroy();
                        }
                    });

                    input.dom.addEventListener('focusout', () => {
                        finishEdit();
                    });
                });

                const deleteButton = new Button({
                    text: '\uE107',
                    class: 'views-item-delete'
                });

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
