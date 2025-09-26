import { Vec3, Quat } from 'playcanvas';

import { CubicSpline } from './anim/spline';
import { Events } from './events';
import { Splat } from './splat';
import { Transform } from './transform';

type FrameTransform = {
    frame: number,
    transform: Transform
}

const registerSplatAnimEvents = (events: Events) => {
    const transforms: Map<Splat, FrameTransform[]> = new Map();

    let onTimelineChange: (frame: number) => void;

    const rebuildSpline = () => {
        if (transforms.size === 0) {
            onTimelineChange = null;
            return;
        }

        const duration = events.invoke('timeline.frames');

        const orderedTransforms: Map<Splat, FrameTransform[]> = new Map();
        transforms.forEach((fts, splat) => {
            const ordered = fts.slice()
                // filter out keys beyond the end of the timeline
                .filter(a => a.frame < duration)
                // order keys by time for spline
                .sort((a, b) => a.frame - b.frame);
            if (ordered.length > 0) {
                orderedTransforms.set(splat, ordered);
            }
        });

        // construct the spline points to be interpolated
        const splines: Map<Splat, CubicSpline> = new Map();
        orderedTransforms.forEach((fts, splat) => {
            if (fts.length < 2) {
                onTimelineChange = null;
                return;
            }
            const times = fts.map(p => p.frame);
            const points = [];
            for (let i = 0; i < fts.length; ++i) {
                const p = fts[i];
                points.push(p.transform.position.x, p.transform.position.y, p.transform.position.z);
                // use euler angles for interpolation
                const rotation = new Vec3();
                p.transform.rotation.getEulerAngles(rotation);
                points.push(rotation.x, rotation.y, rotation.z);
                points.push(p.transform.scale.x, p.transform.scale.y, p.transform.scale.z);
            }

            // interpolate camera positions and camera target positions
            const spline = CubicSpline.fromPointsLooping(duration, times, points, events.invoke('timeline.smoothness'));
            splines.set(splat, spline);
        });

        // handle application update tick
        onTimelineChange = (frame: number) => {
            const time = frame;
            const selected = events.invoke('selection') as Splat;
            // update all splats with transforms
            transforms.forEach((fts, splat) => {
                const spline = splines.get(splat);
                if (!spline) {
                    return;
                }

                if (fts.length < 2) {
                    return;
                }

                const pos = new Vec3();
                const rot = new Quat();
                const scale = new Vec3();
                const result: number[] = [];

                // evaluate the spline at current time
                spline.evaluate(time, result);

                // set splat transform
                pos.set(result[0], result[1], result[2]);
                rot.setFromEulerAngles(result[3], result[4], result[5]);
                scale.set(result[6], result[7], result[8]);

                splat.move(pos, rot, scale);
                if (splat === selected) {
                    // if the splat is selected, also place the pivot
                    const transform = new Transform(pos, rot, scale);
                    events.fire('pivot.place', transform);
                }
            });
        };
    };

    events.on('timeline.time', (time: number) => {
        onTimelineChange?.(time);
    });

    events.on('timeline.frame', (frame: number) => {
        onTimelineChange?.(frame);
    });

    events.on('timeline.frames', () => {
        rebuildSpline();
        // done in camera poses
        // events.fire('timeline.time', events.invoke('timeline.frame'));
    });

    events.on('timeline.smoothness', () => {
        rebuildSpline();
        // done in camera poses
        // events.fire('timeline.time', events.invoke('timeline.frame'));
    });

    // FrameTransform

    const addTransform = (splat: Splat, frame: number) => {
        if (!transforms.has(splat)) {
            transforms.set(splat, []);
        }
        const transform = new Transform(splat.entity.getLocalPosition(), splat.entity.getLocalRotation(), splat.entity.getLocalScale());
        const idx = transforms.get(splat)!.findIndex(p => p.frame === frame);
        if (idx !== -1) {
            transforms.get(splat)![idx].transform = transform;
        }
        else {
            transforms.get(splat)!.push({ frame, transform });
        }

        rebuildSpline();
    };

    const removeTransform = (index: number) => {
        transforms.forEach((fts) => {
            fts.splice(index, 1);
        });

        rebuildSpline();
    };

    events.function('splat.transforms', (splat: Splat) => {
        return transforms.get(splat) || [];
    });

    events.on('splat.removeTransform', (splat: Splat) => {
        transforms.delete(splat);
        rebuildSpline();
    });

    // timeline events

    events.on('timeline.add', (frame: number) => {
        // get the selected splat
        const splat = events.invoke('selection') as Splat;
        if (!splat) {
            return;
        }

        addTransform(splat, frame);
    });

    events.on('timeline.move', (frameFrom: number, frameTo: number) => {
        if (frameFrom === frameTo) return;
        transforms.forEach((fts) => {
            const fromIndex = fts.findIndex(p => p.frame === frameFrom);
            if (fromIndex === -1) {
                return;
            }

            const toIndex = fts.findIndex(p => p.frame === frameTo);
            fts[fromIndex].frame = frameTo;
            if (toIndex !== -1) {
                fts.splice(toIndex, 1);
            }
        });

        rebuildSpline();
    });

    events.on('timeline.remove', (index: number) => {
        removeTransform(index);
    });

    events.on('timeline.frames', () => {
        rebuildSpline();
    });

    // doc
    // todo:
};

export { registerSplatAnimEvents };
