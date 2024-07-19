import { Element, ElementType } from './element';
import { Splat } from './splat';
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
        if (element !== selection && (!element || (element as Splat).visible)) {
            selection = element;
            events.fire('selection.changed', selection);
            scene.forceRender = true;
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

    events.on('splat.vis', (splat: Splat) => {
        if (splat === selection && !splat.visible) {
            events.fire('selection', null);
        }
    });

    events.on('camera.focalPointPicked', (details: { splat: Splat }) => {
        events.fire('selection', details.splat);
    });
};

export { initSelection };
