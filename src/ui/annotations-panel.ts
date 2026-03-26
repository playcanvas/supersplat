import { Button, Container, Label, TextInput } from '@playcanvas/pcui';
import Sortable from 'sortablejs';

import { Annotation } from '../annotation-manager';
import { Events } from '../events';
import deleteSvg from './svg/delete.svg';

const createSvg = (svgString: string) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

class AnnotationsPanel extends Container {
    constructor(events: Events, args = {}) {
        args = {
            ...args,
            id: 'annotations-panel'
        };

        super(args);

        const header = new Container({
            class: 'annotations-panel-header'
        });

        const headerLabel = new Label({
            text: 'Annotations',
            class: 'annotations-panel-header-label'
        });

        header.append(headerLabel);

        const listContainer = new Container({
            class: 'annotations-list-container'
        });

        const createButton = new Button({
            text: 'Add +',
            class: 'annotations-create-button'
        });

        createButton.on('click', () => {
            events.invoke('annotations.add');
        });

        this.append(header);
        this.append(listContainer);
        this.append(createButton);

        let sortableInstance: Sortable | null = null;
        let isReordering = false;

        const rebuildList = (annotations: Annotation[]) => {
            if (isReordering) {
                isReordering = false;
                return;
            }

            if (sortableInstance) {
                sortableInstance.destroy();
                sortableInstance = null;
            }

            listContainer.clear();

            annotations.forEach((annotation, index) => {
                const row = new Container({
                    class: 'annotations-list-item'
                });

                row.dom.dataset.index = String(index);

                const dragHandle = new Label({
                    text: '\u2237',
                    class: 'annotations-item-drag'
                });

                const nameLabel = new Label({
                    text: annotation.name,
                    class: 'annotations-item-name'
                });

                nameLabel.on('click', () => {
                    events.invoke('annotations.goto', index);
                });

                const deleteButton = new Button({
                    class: 'annotations-item-delete'
                });

                deleteButton.dom.appendChild(createSvg(deleteSvg));

                deleteButton.on('click', () => {
                    events.invoke('annotations.remove', index);
                });

                row.append(dragHandle);
                row.append(nameLabel);
                row.append(deleteButton);

                listContainer.append(row);
            });

            // Initialize SortableJS
            if (annotations.length > 1) {
                sortableInstance = Sortable.create(listContainer.dom, {
                    handle: '.annotations-item-drag',
                    animation: 150,
                    forceFallback: true,
                    fallbackClass: 'sortable-fallback',
                    ghostClass: 'sortable-ghost',
                    chosenClass: 'sortable-chosen',
                    dragClass: 'sortable-drag',
                    onEnd: (evt) => {
                        const oldIndex = evt.oldIndex;
                        const newIndex = evt.newIndex;
                        if (oldIndex !== undefined && newIndex !== undefined && oldIndex !== newIndex) {
                            isReordering = true;
                            events.invoke('annotations.reorder', oldIndex, newIndex);
                        }
                    }
                });
            }
        };

        events.on('annotations.changed', (annotations: Annotation[]) => {
            rebuildList(annotations);
        });
    }
}

export { AnnotationsPanel };
