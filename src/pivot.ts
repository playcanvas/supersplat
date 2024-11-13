import { Vec3, Quat } from 'playcanvas';

import { Events } from './events';
import { Transform } from './transform';

// stores the transform pivot location in world space
// the transform tools (translate, rotate, scale) and transform panel modify this pivot
// then the active transform handler applies the changes to the current selection.
class Pivot {
    transform = new Transform();

    place: (transform: Transform) => void;
    start: () => void;
    move: (transform: Transform) => void;
    moveTRS: (position: Vec3, rotation: Quat, scale: Vec3) => void;
    end: () => void;

    constructor(events: Events) {

        this.place = (transform: Transform) => {
            if (!this.transform.equals(transform)) {
                this.transform.copy(transform);

                events.fire('pivot.placed', this);
            }
        };

        this.start = () => {
            events.fire('pivot.started', this);
        };

        this.move = (transform: Transform) => {
            if (!this.transform.equals(transform)) {
                this.transform.copy(transform);

                events.fire('pivot.moved', this);
            }
        };

        this.moveTRS = (position: Vec3, rotation: Quat, scale: Vec3) => {
            if (!this.transform.equalsTRS(position, rotation, scale)) {
                this.transform.set(position, rotation, scale);

                events.fire('pivot.moved', this);
            }
        };

        this.end = () => {
            events.fire('pivot.ended', this);
        };

        events.on('pivot.place', this.place);
        events.on('pivot.start', this.start);
        events.on('pivot.moveTRS', this.moveTRS);
        events.on('pivot.end', this.end);
    }
}

const registerPivotEvents = (events: Events) => {
    const pivot = new Pivot(events);

    events.function('pivot', () => {
        return pivot;
    });
};

export { registerPivotEvents, Pivot };
