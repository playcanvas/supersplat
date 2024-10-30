import { Container, Label, Element as PcuiElement } from 'pcui';
import { Events } from '../events';
import { Splat } from '../splat';
import { Annotation } from '../gsplat-labels';
import { Element, ElementType } from '../element';

import shownSvg from '../svg/shown.svg';
import hiddenSvg from '../svg/hidden.svg';
import deleteSvg from '../svg/delete.svg';

const createSvg = (svgString: string) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

class AnnotationItem extends Container {
    getSelected: () => boolean;
    setSelected: (value: boolean) => void;
    getVisible: () => boolean;
    setVisible: (value: boolean) => void;
    destroy: () => void;

    constructor(name: string, args = {}) {
        args = {
            ...args,
            class: ['annotation-item', 'visible']
        };

        super(args);

        const text = new Label({
            class: 'annotation-item-text',
            text: name
        });

        const visible = new PcuiElement({
            dom: createSvg(shownSvg),
            class: 'annotation-item-visible',
        });

        const invisible = new PcuiElement({
            dom: createSvg(hiddenSvg),
            class: 'annotation-item-visible',
            hidden: true
        });

        const remove = new PcuiElement({
            dom: createSvg(deleteSvg),
            class: 'annotation-item-delete'
        });

        this.append(text);
        this.append(visible);
        this.append(invisible);
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
                visible.hidden = !value;
                invisible.hidden = value;
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
        invisible.dom.addEventListener('click', toggleVisible, true);
        remove.dom.addEventListener('click', handleRemove, true);

        this.destroy = () => {
            visible.dom.removeEventListener('click', toggleVisible, true);
            invisible.dom.removeEventListener('click', toggleVisible, true);
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

class AnnotationList extends Container {
    constructor(events: Events, args = {}) {
        args = {
            ...args,
            class: 'annotation-list'
        };

        super(args);

        const items = new Map<Annotation, AnnotationItem>();
        var splat: Splat = null;

        /*events.on('scene.elementAdded', (element: Element) => {
            if (element.type === ElementType.splat) {
                const splat = element as Splat;
                const item = new AnnotationItem(splat.filename);
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
        });*/

        /*events.on('scene.elementRemoved', (element: Element) => {
            if (element.type === ElementType.splat) {
                const splat = element as Splat;
                const item = items.get(splat);
                if (item) {
                    this.remove(item);
                    items.delete(splat);
                }
            }
        });*/

        events.on('selection.changed', (selection: Splat) => {
           // if (selection !== splat || items.size === 0){
                splat = selection;
                
                // Clear previous annotations
                for (const [key, item] of items.entries()) {
                    this.remove(item)
                    items.delete(key);
                }

                // If labelData exists - fill in the annotation list
                if (splat !== undefined && splat.labelData !== null) {
                    const labelData = selection.labelData;
                    const categories = labelData.categories;
                    // Todo - support multiple label sets on single splat
                    for (const annotation of labelData.labels[0].annotations){

                        var name;
                        if (annotation.category_id == 0){
                            name = categories[annotation.category_id].name;
                        }else{
                            name = categories[annotation.category_id].name + " - " + annotation.id.toString();
                        }
                        
                        const item = new AnnotationItem(name)
                        this.append(item);
                        items.set(annotation, item);
                        
                        item.on('visible', () => {
                            annotation.isHidden = false;
                            // BUG: when setting an annotation visible - all hidden annotations are set to visible too
                            // TODO - perform hide procedure directly on splats, rather than through selection.
                            events.fire('select.unhide');
                            events.fire('select.none');
                            for (const visible_annotation of labelData.labels[0].annotations){
                                if (visible_annotation.isHidden){
                                    const op = (i: number) => {
                                        return splat.labelData.labels[0].point_annotations[i] === visible_annotation.id;
                                    };
                                    events.fire('select.pred', 'add', op);
                                }
                            }
                            events.fire('select.hide');
                            events.fire('select.none');
                        });
                        item.on('invisible', () => {
                            annotation.isHidden = true;
                            events.fire('select.none');
                            const op = (i: number) => {
                                return splat.labelData.labels[0].point_annotations[i] === annotation.id;
                            };
                            events.fire('select.pred', 'add', op);
                            events.fire('select.hide');
                            events.fire('select.none');
                        });
                    }
               // }
            }
        });

        /*events.on('splat.visibility', (splat: Splat) => {
            const item = items.get(splat);
            if (item) {
                item.visible = splat.visible;
            }
        });*/

        this._onClickEvt()
        this.on('click_item', (item: AnnotationItem, ev: PointerEvent) => {
            for (const [key, value] of items) {
                if (item === value) {
                    item.selected = true;
        
                    const op = (i: number) => {
                        return splat.labelData.labels[0].point_annotations[i] === key.id;
                    };
        
                    if (!ev.shiftKey) {
                        events.fire('select.none');
                    }
                    events.fire('select.pred', 'add', op);
                } else {
                    if (!ev.shiftKey) {
                        value.selected = false;
                    }
                }
            }
        });
        /*this.on('removeClicked', async (item: AnnotationItem) => {
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
                header: 'Remove Splat',
                message: `Are you sure you want to remove '${splat.filename}' from the scene? This operation can not be undone.`
            });

            if (result?.action === 'yes') {
                splat.destroy();
            }
        });*/
    }

    protected _onAppendChild(element: PcuiElement): void {
        super._onAppendChild(element);

        if (element instanceof AnnotationItem) {
            element.on('click', (ev) => {
                this.emit('click_item', element, ev);
            });

            element.on('removeClicked', () => {
                this.emit('removeClicked', element);
            });
        }
    }

    protected _onRemoveChild(element: PcuiElement): void {
        if (element instanceof AnnotationItem) {
            element.unbind('click_item');
            element.unbind('removeClicked');
        }

        super._onRemoveChild(element);
    }
}

export { AnnotationList, AnnotationItem };
