import { Vec3 } from 'playcanvas';

import { CubicSpline } from './anim/spline';
import { Events } from './events';

type Pose = {
    name: string,
    frame: number,
    position: Vec3,
    target: Vec3
};

const registerCameraPosesEvents = (events: Events) => {
    const poses: Pose[] = [];

    let onTimelineChange: (frame: number) => void;

    const rebuildSpline = () => {
        const duration = events.invoke('timeline.frames');

        const orderedPoses = poses.slice()
        // filter out keys beyond the end of the timeline
        .filter(a => a.frame < duration)
        // order keys by time for spline
        .sort((a, b) => a.frame - b.frame);

        // construct the spline points to be interpolated
        const times = orderedPoses.map(p => p.frame);
        const points = [];
        for (let i = 0; i < orderedPoses.length; ++i) {
            const p = orderedPoses[i];
            points.push(p.position.x, p.position.y, p.position.z);
            points.push(p.target.x, p.target.y, p.target.z);
        }

        if (orderedPoses.length > 1) {
            // interpolate camera positions and camera target positions
            const spline = CubicSpline.fromPointsLooping(duration, times, points, events.invoke('timeline.smoothness'));
            const result: number[] = [];
            const pose = { position: new Vec3(), target: new Vec3() };

            // handle application update tick
            onTimelineChange = (frame: number) => {
                const time = frame;

                // evaluate the spline at current time
                spline.evaluate(time, result);

                // set camera pose
                pose.position.set(result[0], result[1], result[2]);
                pose.target.set(result[3], result[4], result[5]);
                events.fire('camera.setPose', pose, 0);
            };
        } else {
            onTimelineChange = null;
        }
    };

    events.on('timeline.time', (time: number) => {
        onTimelineChange?.(time);
    });

    events.on('timeline.frame', (frame: number) => {
        onTimelineChange?.(frame);
    });

    events.on('timeline.frames', () => {
        rebuildSpline();
        events.fire('timeline.time', events.invoke('timeline.frame'));
    });

    events.on('timeline.smoothness', () => {
        rebuildSpline();
        events.fire('timeline.time', events.invoke('timeline.frame'));
    });

    // poses

    const addPose = (pose: Pose) => {
        if (pose.frame === undefined) {
            return false;
        }

        // if a pose already exists at this time, update it
        const idx = poses.findIndex(p => p.frame === pose.frame);
        if (idx !== -1) {
            poses[idx] = pose;
        } else {
            poses.push(pose);
            events.fire('timeline.addKey', pose.frame);
        }

        rebuildSpline();
    };

    const removePose = (index: number) => {
        poses.splice(index, 1);

        // remove the timeline key
        rebuildSpline();
        events.fire('timeline.removeKey', index);
    };

    const movePose = (index: number, frame: number) => {
        // remove target frame pose
        const toIndex = poses.findIndex(p => p.frame === frame);
        // move pose
        poses[index].frame = frame;
        if (toIndex !== -1) {
            removePose(toIndex);
        }

        rebuildSpline();
        events.fire('timeline.setKey', index, frame);
    };

    events.function('camera.poses', () => {
        return poses;
    });

    events.on('camera.addPose', (pose: Pose) => {
        addPose(pose);
    });

    events.on('timeline.add', (frame: number) => {
        // get the current camera pose
        const pose = events.invoke('camera.getPose');

        addPose({
            name: `camera_${poses.length}`,
            frame,
            position: pose.position,
            target: pose.target
        });
    });

    events.on('timeline.move', (frameFrom: number, frameTo: number) => {
        if (frameFrom === frameTo) return;

        const index = poses.findIndex(p => p.frame === frameFrom);
        if (index !== -1) {
            movePose(index, frameTo);
        }
    });

    events.on('timeline.remove', (index: number) => {
        removePose(index);
    });

    events.on('timeline.frames', () => {
        rebuildSpline();
    });

    // doc

    events.function('docSerialize.poseSets', (): any[] => {
        const pack3 = (v: Vec3) => [v.x, v.y, v.z];

        if (poses.length === 0) {
            return [];
        }

        return [{
            name: 'set0',
            poses: poses.map((pose) => {
                return {
                    name: pose.name,
                    frame: pose.frame,
                    position: pack3(pose.position),
                    target: pack3(pose.target)
                };
            })
        }];
    });

    events.function('docDeserialize.poseSets', (poseSets: any[]) => {
        if (poseSets.length === 0) {
            return;
        }

        const fps = events.invoke('timeline.frameRate');

        // for now, load the first poseSet
        poseSets[0].poses.forEach((docPose: any, index: number) => {
            addPose({
                name: docPose.name,
                frame: docPose.frame ?? (index * fps),
                position: new Vec3(docPose.position),
                target: new Vec3(docPose.target)
            });
        });
    });
};

export { registerCameraPosesEvents, Pose };
