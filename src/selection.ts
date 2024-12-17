import { Element, ElementType } from './element';
import { Events } from './events';
import { Scene } from './scene';
import { Splat } from './splat';

const registerSelectionEvents = (events: Events, scene: Scene) => {
    let selection: Splat = null;

    const setSelection = (splat: Splat) => {
        if (splat !== selection && (!splat || splat.visible)) {
            const prev = selection;
            selection = splat;
            events.fire('selection.changed', selection, prev);
        }
    };

    events.on('selection', (splat: Splat) => {
        setSelection(splat);
    });

    events.function('selection', () => {
        return selection;
    });

    events.on('selection.next', () => {
        const splats = scene.getElementsByType(ElementType.splat) as Splat[];
        if (splats.length > 1) {
            const idx = splats.indexOf(selection);
            setSelection(splats[(idx + 1) % splats.length]);
        }
    });

    events.on('scene.elementAdded', (element: Element) => {
        if (element.type === ElementType.splat) {
            setSelection(element as Splat);
        }
    });

    events.on('scene.elementRemoved', (element: Element) => {
        if (element === selection) {
            const splats = scene.getElementsByType(ElementType.splat) as Splat[];
            setSelection(splats.length === 1 ? null : splats.find(v => v !== element));
        }
    });

    events.on('splat.visibility', (splat: Splat) => {
        if (splat === selection && !splat.visible) {
            setSelection(null);
        }
    });

    events.on('camera.focalPointPicked', (details: { splat: Splat }) => {
        setSelection(details.splat);
    });
};

export { registerSelectionEvents };
