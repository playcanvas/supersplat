import { Quat, Vec3 } from 'playcanvas';
import { Events } from './events';
import { Splat } from './splat';
import { EntityTransform } from './edit-ops';
import { EntityTransformTarget } from './entity-transform-target';
import { SplatsTransformTarget } from './splats-transform-target';

interface TransformTarget {
    pivot: EntityTransform;

    bind: () => void;
    unbind: () => void;
    start: () => void;
    update: (position?: Vec3, rotation?: Quat, scale?: Vec3) => void;
    end: () => void;
}

const registerTransformTargetEvents = (events: Events) => {
    let transformTarget: TransformTarget = null;

    const setTransformTarget = (target: TransformTarget) => {
        if (target !== transformTarget) {
            if (transformTarget) {
                transformTarget.unbind();
            }
            transformTarget = target;
            if (transformTarget) {
                transformTarget.bind();
            }
            events.fire('transformTarget.changed', transformTarget);
        }
    };

    events.function('transformTarget', () => {
        return transformTarget;
    });

    events.on('transformTarget', (target: TransformTarget) => {
        setTransformTarget(target);
    });

    // bind transform target when selection changes
    const entityTransformTarget = new EntityTransformTarget(events);
    const splatsTransformTarget = new SplatsTransformTarget(events);

    const updateTarget = (splat: Splat) => {
        let target: TransformTarget = null;

        if (splat) {
            target = splat.numSelected > 0 ? splatsTransformTarget : entityTransformTarget
        }

        events.fire('transformTarget', target);
    };

    events.on('selection.changed', (splat) => {
        updateTarget(splat);
    });

    events.on('splat.stateChanged', (splat: Splat) => {
        updateTarget(splat);
    });
};

export { registerTransformTargetEvents, TransformTarget };
