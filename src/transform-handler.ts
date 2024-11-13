import { EntityTransformHandler } from './entity-transform-handler';
import { Events } from './events';
import { registerPivotEvents } from './pivot';
import { Splat } from './splat';
import { SplatsTransformHandler } from './splats-transform-handler';

interface TransformHandler {
    activate: () => void;
    deactivate: () => void;
}

const registerTransformHandlerEvents = (events: Events) => {
    let transformHandler: TransformHandler = null;

    const setTransformHandler = (handler: TransformHandler) => {
        if (transformHandler) {
            transformHandler.deactivate();
        }
        transformHandler = handler;
        if (transformHandler) {
            transformHandler.activate();
        }
    };

    // bind transform target when selection changes
    const entityTransformHandler = new EntityTransformHandler(events);
    const splatsTransformHandler = new SplatsTransformHandler(events);

    const update = (splat: Splat) => {
        if (!splat) {
            setTransformHandler(null);
        } else {
            if (splat.numSelected > 0) {
                setTransformHandler(splatsTransformHandler);
            } else {
                setTransformHandler(entityTransformHandler);
            }
        }
    };

    events.on('selection.changed', update);
    events.on('splat.stateChanged', update);

    registerPivotEvents(events);
};

export { registerTransformHandlerEvents, TransformHandler };
