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
        const quats: Map<Splat, Quat[]> = new Map();
        orderedTransforms.forEach((fts, splat) => {
            if (fts.length < 2) {
                return;
            }
            const times = fts.map(p => p.frame);
            const points = [];
            for (let i = 0; i < fts.length; ++i) {
                const p = fts[i];
                points.push(p.transform.position.x, p.transform.position.y, p.transform.position.z);
                // points.push(p.transform.rotation.x, p.transform.rotation.y, p.transform.rotation.z, p.transform.rotation.w);
                points.push(p.transform.scale.x, p.transform.scale.y, p.transform.scale.z);
            }

            // interpolate splat positions, rotations and scales
            const spline = CubicSpline.fromPointsLooping(duration, times, points, events.invoke('timeline.smoothness'));
            splines.set(splat, spline);
            quats.set(splat, fts.map(p => p.transform.rotation));
        });

        // handle application update tick
        onTimelineChange = (frame: number) => {
            const time = frame;
            const selected = events.invoke('selection') as Splat;
            // update all splats with transforms
            transforms.forEach((fts, splat) => {
                const spline = splines.get(splat);
                const quat = quats.get(splat);

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
                scale.set(result[3], result[4], result[5]);
                
                // interpolate rotation. TODO: move this into the spline?
                if (time <= fts[0].frame || time >= fts[fts.length - 1].frame) {
                    rot.slerp(quat[0], quat[quat.length - 1], time <= fts[0].frame ? (time - fts[0].frame) / (duration + fts[0].frame - fts[fts.length - 1].frame) : 1 - (time - fts[fts.length - 1].frame) / (duration - fts[fts.length - 1].frame + fts[0].frame));
                } else {
                    // use spherical linear interpolation (slerp) for rotation
                    let seg = 0;
                    while (fts[seg + 1] && time >= fts[seg + 1].frame) {
                        seg++;
                    }
                    const t = (time - fts[seg].frame) / (fts[seg + 1].frame - fts[seg].frame);
                    rot.slerp(quat[seg], quat[seg + 1], t);
                }

                splat.move(pos, rot, scale);
                if (splat === selected) {
                    // if the splat is selected, also place the pivot
                    const transform = new Transform(pos, rot, scale);
                    events.fire('pivot.place', transform);
                }
            });
        };
    };

    // clear all splat transforms on scene clear
    events.on('scene.clear', () => {
        transforms.clear();
        onTimelineChange = null;
    });

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
    events.function('docSerialize.splatTransforms', (splats: Splat[]): any[] => {
        const pack3 = (v: Vec3) => [v.x, v.y, v.z];

        if (transforms.size === 0) {
            return [];
        }

        return [...transforms.entries()].map(([splat, fts]) => {
            const index = splats.indexOf(splat)
            return {
                name: splat.name,
                index: index,
                transforms: fts.map(ft => ({
                    frame: ft.frame,
                    position: pack3(ft.transform.position),
                    rotation: pack3(ft.transform.rotation.getEulerAngles()),
                    scale: pack3(ft.transform.scale)
                }))
            };
        });
    });

    events.function('docDeserialize.splatTransforms', (splats: Splat[], splatTransforms: any[]) => {
        if (splatTransforms.length === 0) {
            return;
        }

        const fps = events.invoke('timeline.frameRate');

        splatTransforms.forEach((docSplat: any) => {
            const splat = splats[docSplat.index];
            if (!splat) {
                return;
            }

            transforms.set(splat, []);
            docSplat.transforms.forEach((docTransform: any, index: number) => {
                transforms.get(splat).push({
                    frame: docTransform.frame ?? (index * fps),
                    transform: new Transform(
                        new Vec3(docTransform.position),
                        new Quat().setFromEulerAngles(docTransform.rotation[0], docTransform.rotation[1], docTransform.rotation[2]),
                        new Vec3(docTransform.scale)
                    )
                });
            });
        });

        rebuildSpline();
    });
};

export { registerSplatAnimEvents };
