import { Vec3 } from 'playcanvas';

import { CubicSpline } from './anim/spline';
import type { AnimTrack } from './anim-track';
import type { Events } from './events';

type Pose = {
    name: string;
    frame: number;
    position: Vec3;
    target: Vec3;
    fov?: number;
    // roll in degrees about the view axis, relative to the level look-at
    // orientation. absent in legacy poses (treated as 0).
    roll?: number;
};

// pose as stored in documents
type PackedPose = {
    name: string;
    frame?: number;
    position: number[];
    target: number[];
    fov?: number;
    roll?: number;
};

type PoseSet = {
    name: string;
    poses: PackedPose[];
};

// a camera as reported by camera.getPose, before it becomes a keyframe
type PoseValues = {
    position: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
    fov: number;
    roll?: number;
};

// build a pose from a camera.getPose result
const createPose = (values: PoseValues, frame: number, name: string): Pose => ({
    name,
    frame,
    position: new Vec3(values.position.x, values.position.y, values.position.z),
    target: new Vec3(values.target.x, values.target.y, values.target.z),
    fov: values.fov,
    roll: values.roll ?? 0
});

// copy a pose so edits and snapshots never share its vectors
const clonePose = (pose: Pose, overrides: Partial<Pose> = {}): Pose => ({
    ...pose,
    position: pose.position.clone(),
    target: pose.target.clone(),
    ...overrides
});

// whether two poses put the camera in the same place (ignoring name/frame)
const samePose = (a: Pose, b: Pose) =>
    a.position.equals(b.position) && a.target.equals(b.target) && a.fov === b.fov && (a.roll ?? 0) === (b.roll ?? 0);

const packPose = (pose: Pose): PackedPose => ({
    name: pose.name,
    frame: pose.frame,
    position: [pose.position.x, pose.position.y, pose.position.z],
    target: [pose.target.x, pose.target.y, pose.target.z],
    fov: pose.fov,
    roll: pose.roll
});

const unpackPose = (pose: PackedPose, frame: number, fov: number): Pose => ({
    name: pose.name,
    frame: pose.frame ?? frame,
    position: new Vec3(pose.position),
    target: new Vec3(pose.target),
    fov: pose.fov ?? fov,
    roll: pose.roll ?? 0
});

/**
 * Camera animation track that manages camera keyframes and interpolation.
 * Implements AnimTrack interface so it can be used with the timeline system.
 *
 * Fully self-contained: subscribes to timeline events internally for
 * evaluation and spline rebuilding.
 */
class CameraAnimTrack implements AnimTrack {
    private poses: Pose[] = [];
    private events: Events;
    private onTimelineChange: ((frame: number) => void) | null = null;

    // while the path recorder is running the user owns the camera, so
    // evaluation must not drive it (see camera-recorder.ts)
    private recording = false;

    constructor(events: Events) {
        this.events = events;

        // Evaluate on timeline playback and scrub
        events.on('timeline.time', (time: number) => {
            this.evaluate(time);
        });

        events.on('timeline.frame', (frame: number) => {
            this.evaluate(frame);
        });

        // Rebuild spline when timeline parameters change
        events.on('timeline.frames', () => {
            this.rebuildSpline();
        });

        events.on('timeline.smoothness', () => {
            this.rebuildSpline();
        });

        events.on('timeline.loop', () => {
            this.rebuildSpline();
        });

        // Suspend evaluation while the path recorder is running
        events.on('recorder.recording', (recording: boolean) => {
            this.recording = recording;
        });

        // Clear track when scene is cleared
        events.on('scene.clear', () => {
            this.clear();
        });
    }

    get keys(): readonly number[] {
        return this.poses.map((p) => p.frame);
    }

    addKey(frame: number): boolean {
        const pose = this.events.invoke('camera.getPose');
        if (!pose) return false;

        this.store(createPose(pose, frame, `camera_${this.poses.length}`));
        return true;
    }

    removeKey(frame: number): boolean {
        const index = this.poses.findIndex((p) => p.frame === frame);
        if (index === -1) return false;
        this.poses.splice(index, 1);
        this.rebuildSpline();
        this.events.fire('track.keyRemoved', frame);
        return true;
    }

    moveKey(fromFrame: number, toFrame: number): boolean {
        if (fromFrame === toFrame) return false;

        const moved = this.poses.find((p) => p.frame === fromFrame);
        if (!moved) return false;

        // Remove any existing pose at the target frame
        this.removeFrame(toFrame);

        moved.frame = toFrame;
        this.rebuildSpline();
        this.events.fire('track.keyMoved', fromFrame, toFrame);
        return true;
    }

    copyKey(fromFrame: number, toFrame: number): boolean {
        if (fromFrame === toFrame) return false;

        const source = this.poses.find((p) => p.frame === fromFrame);
        if (!source) return false;

        // Remove any existing pose at the target frame
        this.removeFrame(toFrame);

        this.poses.push(clonePose(source, { name: `camera_${this.poses.length}`, frame: toFrame }));

        this.rebuildSpline();
        this.events.fire('track.keyAdded', toFrame);
        return true;
    }

    evaluate(frame: number): void {
        if (this.recording) return;
        this.onTimelineChange?.(frame);
    }

    clear(): void {
        this.poses.length = 0;
        this.onTimelineChange = null;
        this.events.fire('track.keysCleared');
    }

    snapshot(): Pose[] {
        return this.poses.map((p) => clonePose(p));
    }

    restore(snapshot: unknown): void {
        this.poses = (snapshot as Pose[]).map((p) => clonePose(p));
        this.rebuildSpline();
        this.events.fire('track.keysLoaded');
    }

    /**
     * Add a pose directly (used for deserialization).
     */
    addPose(pose: Pose): void {
        if (pose.frame === undefined) {
            return;
        }

        pose.fov ??= this.events.invoke('camera.fov') ?? 60;
        this.store(pose);
    }

    /**
     * Get all poses (used for serialization).
     */
    getPoses(): readonly Pose[] {
        return this.poses;
    }

    /**
     * Load poses from serialized data.
     */
    loadPoses(posesData: Pose[]): void {
        const defaultFov = this.events.invoke('camera.fov');
        this.poses = posesData.map((pose) => clonePose(pose, { fov: pose.fov ?? defaultFov }));
        this.rebuildSpline();
        this.events.fire('track.keysLoaded');
    }

    // insert a pose or replace the key already on its frame
    private store(pose: Pose): void {
        const index = this.poses.findIndex((p) => p.frame === pose.frame);
        if (index === -1) {
            this.poses.push(pose);
        } else {
            this.poses[index] = pose;
        }
        this.rebuildSpline();
        this.events.fire(index === -1 ? 'track.keyAdded' : 'track.keyUpdated', pose.frame);
    }

    // drop the key on a frame, if there is one
    private removeFrame(frame: number): void {
        const index = this.poses.findIndex((p) => p.frame === frame);
        if (index !== -1) {
            this.poses.splice(index, 1);
        }
    }

    private rebuildSpline(): void {
        const duration = this.events.invoke('timeline.frames');
        const smoothness = this.events.invoke('timeline.smoothness');
        const loop = this.events.invoke('timeline.loop');

        const orderedPoses = this.poses
            .slice()
            .filter((a) => a.frame < duration)
            .sort((a, b) => a.frame - b.frame);

        const times = orderedPoses.map((p) => p.frame);
        const points: number[] = [];
        let prevRoll = 0;
        for (let i = 0; i < orderedPoses.length; ++i) {
            const p = orderedPoses[i];
            points.push(p.position.x, p.position.y, p.position.z);
            points.push(p.target.x, p.target.y, p.target.z);

            // unwrap roll so interpolation takes the short way around
            let roll = p.roll ?? 0;
            if (i > 0) {
                while (roll - prevRoll > 180) roll -= 360;
                while (roll - prevRoll < -180) roll += 360;
            }
            prevRoll = roll;

            points.push(p.fov);
            points.push(roll);
        }

        if (orderedPoses.length > 1) {
            // when not looping the spline clamps, holding the first/last pose
            // beyond the outer keys instead of wrapping the end into the start
            const spline = loop
                ? CubicSpline.fromPointsLooping(duration, times, points, smoothness)
                : CubicSpline.fromPoints(times, points, smoothness);
            const result: number[] = [];
            const pose = { position: new Vec3(), target: new Vec3(), fov: 0, roll: 0 };

            this.onTimelineChange = (frame: number) => {
                spline.evaluate(frame, result);
                pose.position.set(result[0], result[1], result[2]);
                pose.target.set(result[3], result[4], result[5]);
                pose.fov = result[6];
                pose.roll = result[7];
                this.events.fire('camera.setPose', pose, 0);
            };
        } else if (orderedPoses.length === 1) {
            // a single key can't form a spline; hold its pose at every frame
            const p = orderedPoses[0];
            const pose = {
                position: p.position.clone(),
                target: p.target.clone(),
                fov: p.fov,
                roll: p.roll ?? 0
            };

            this.onTimelineChange = () => {
                this.events.fire('camera.setPose', pose, 0);
            };
        } else {
            this.onTimelineChange = null;
        }

        // re-evaluate at the current frame so the camera updates immediately
        this.evaluate(this.events.invoke('timeline.frame'));
    }
}

/**
 * Register the camera animation track and expose it via events.
 * The track is fully self-contained (subscribes to timeline events internally),
 * so this function only needs to create it, expose it, and handle serialization.
 */
const registerCameraPosesEvents = (events: Events) => {
    const track = new CameraAnimTrack(events);

    // Expose the camera animation track
    events.function('camera.animTrack', () => {
        return track;
    });

    // expose poses
    events.function('camera.poses', () => {
        return track.getPoses();
    });

    events.on('camera.loadPoses', (poses: Pose[]) => {
        track.loadPoses(poses);
    });

    // Serialization

    events.function('docSerialize.poseSets', (): PoseSet[] => {
        const poses = track.getPoses();

        if (poses.length === 0) {
            return [];
        }

        return [
            {
                name: 'set0',
                poses: poses.map(packPose)
            }
        ];
    });

    events.function('docDeserialize.poseSets', (poseSets: PoseSet[], documentCameraFov?: number) => {
        if (!poseSets || poseSets.length === 0) {
            return;
        }

        const fps = events.invoke('timeline.frameRate');

        const defaultFov = documentCameraFov ?? events.invoke('camera.fov') ?? 60;

        track.loadPoses(
            poseSets[0].poses.map((docPose, index) => unpackPose(docPose, docPose.frame ?? index * fps, defaultFov))
        );
    });
};

export { registerCameraPosesEvents, CameraAnimTrack, Pose, createPose, samePose };
