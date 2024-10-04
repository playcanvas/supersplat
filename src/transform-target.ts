import { Quat, Vec3 } from 'playcanvas';
import { Events } from './events';
import { registerEntityTransformTargetEvents } from './entity-transform-target';
import { EntityTransform } from './edit-ops';

interface TransformTarget {
    pivot: EntityTransform;

    start: () => void;
    update: (position?: Vec3, rotation?: Quat, scale?: Vec3) => void;
    end: () => void;
}

const registerTransformTargetEvents = (events: Events) => {
    let transformTarget: TransformTarget = null;

    const setTransformTarget = (target: TransformTarget) => {
        if (target !== transformTarget) {
            transformTarget = target;
            events.fire('transformTarget.changed', transformTarget);
        }
    };

    events.function('transformTarget', () => {
        return transformTarget;
    });

    events.on('transformTarget', (target: TransformTarget) => {
        setTransformTarget(target);
    });

    registerEntityTransformTargetEvents(events);
};

export { registerTransformTargetEvents, TransformTarget };
