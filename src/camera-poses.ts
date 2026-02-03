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
        }

        rebuildSpline();
    };

    const removePose = (index: number) => {
        if (index < 0 || index >= poses.length) {
            return;
        }
        poses.splice(index, 1);
        rebuildSpline();
    };

    const movePose = (index: number, frame: number) => {
        // save reference before array modification
        const pose = poses[index];

        // remove target frame pose if one exists
        const toIndex = poses.findIndex(p => p.frame === frame);
        if (toIndex !== -1) {
            removePose(toIndex);
        }

        // move pose
        pose.frame = frame;

        rebuildSpline();
    };

    events.function('camera.poses', () => {
        return poses;
    });

    events.on('camera.addPose', (pose: Pose) => {
        addPose(pose);
    });

    // When a key is added via user action, capture the current camera pose
    events.on('timeline.keyAdded', (frame: number) => {
        const pose = events.invoke('camera.getPose');

        addPose({
            name: `camera_${poses.length}`,
            frame,
            position: pose.position,
            target: pose.target
        });
    });

    // When a key is updated via user action, update the pose at that frame
    events.on('timeline.keyUpdated', (frame: number) => {
        const pose = events.invoke('camera.getPose');

        addPose({
            name: `camera_${poses.length}`,
            frame,
            position: pose.position,
            target: pose.target
        });
    });

    // When a key is moved, move the corresponding pose
    events.on('timeline.keyMoved', (index: number, fromFrame: number, toFrame: number) => {
        const poseIndex = poses.findIndex(p => p.frame === fromFrame);
        if (poseIndex !== -1) {
            movePose(poseIndex, toFrame);
        }
    });

    // When a key is removed, remove the corresponding pose
    events.on('timeline.keyRemoved', (index: number) => {
        // Find pose at the same index and remove it
        // Note: poses and keys should be in the same order
        removePose(index);
    });

    events.on('timeline.frames', () => {
        rebuildSpline();
    });

    events.on('scene.clear', () => {
        poses.length = 0;
        onTimelineChange = null;
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
        const keys = poseSets[0].poses.map((docPose: any, index: number) => {
            return docPose.frame ?? (index * fps);
        });

        // for now, load the first poseSet
        poseSets[0].poses.forEach((docPose: any, index: number) => {
            addPose({
                name: docPose.name,
                frame: keys[index],
                position: new Vec3(docPose.position),
                target: new Vec3(docPose.target)
            });
        });

        // Load timeline keys from pose frame times
        events.invoke('timeline.loadKeys', keys);
    });
};

export { registerCameraPosesEvents, Pose };
