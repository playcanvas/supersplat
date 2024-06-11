import { Element, ElementType } from './element';
import { Events } from './events';
import { Scene } from './scene';

let selection: Element = null;

const initSelection = (events: Events, scene: Scene) => {
    events.on('scene.elementAdded', (element: Element) => {
        if (element.type === ElementType.splat) {
            setTimeout(() => {
                events.fire('selection', element);
            });
        }
    });

    events.on('scene.elementRemoved', (element: Element) => {
        if (element === selection) {
            const splats = scene.getElementsByType(ElementType.splat);
            events.fire('selection', splats.length === 1 ? null : splats.find(v => v !== element));
        }
    });

    events.on('selection', (element: Element) => {
        if (element !== selection) {
            selection = element;
            events.fire('selection.changed', selection);
            scene.forceRender = true;
        }
    });

    events.on('selection.byUid', (uid: number) => {
        const splat = scene.getElementsByType(ElementType.splat).find(v => v.uid === uid);
        if (splat) {
            events.fire('selection', splat);
        }
    });

    events.function('selection', () => {
        return selection;
    });

    events.on('selection.next', () => {
        const splats = scene.getElementsByType(ElementType.splat);
        if (splats.length > 1) {
            const idx = splats.indexOf(selection);
            events.fire('selection', splats[(idx + 1) % splats.length]);
        }
    });
};

export { initSelection };
