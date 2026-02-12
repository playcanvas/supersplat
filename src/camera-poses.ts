import { Vec3 } from 'playcanvas';

import { CubicSpline } from './anim/spline';
import { AnimTrack } from './anim-track';
import { Events } from './events';

type Pose = {
    name: string,
    frame: number,
    position: Vec3,
    target: Vec3
};

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

        // Clear track when scene is cleared
        events.on('scene.clear', () => {
            this.clear();
        });
    }

    get keys(): readonly number[] {
        return this.poses.map(p => p.frame);
    }

    addKey(frame: number): boolean {
        const pose = this.events.invoke('camera.getPose');
        if (!pose) return false;

        const existingIndex = this.poses.findIndex(p => p.frame === frame);

        // camera.getPose returns plain {x,y,z} objects, convert to Vec3
        const newPose: Pose = {
            name: `camera_${this.poses.length}`,
            frame,
            position: new Vec3(pose.position.x, pose.position.y, pose.position.z),
            target: new Vec3(pose.target.x, pose.target.y, pose.target.z)
        };

        if (existingIndex === -1) {
            this.poses.push(newPose);
            this.rebuildSpline();
            this.events.fire('track.keyAdded', frame);
        } else {
            this.poses[existingIndex] = newPose;
            this.rebuildSpline();
            this.events.fire('track.keyUpdated', frame);
        }
        return true;
    }

    removeKey(frame: number): boolean {
        const index = this.poses.findIndex(p => p.frame === frame);
        if (index === -1) return false;
        this.poses.splice(index, 1);
        this.rebuildSpline();
        this.events.fire('track.keyRemoved', frame);
        return true;
    }

    moveKey(fromFrame: number, toFrame: number): boolean {
        if (fromFrame === toFrame) return false;

        const index = this.poses.findIndex(p => p.frame === fromFrame);
        if (index === -1) return false;

        // Remove any existing pose at the target frame
        const toIndex = this.poses.findIndex(p => p.frame === toFrame);
        if (toIndex !== -1) {
            this.poses.splice(toIndex, 1);
        }

        // Update the frame (re-find index since splice may have shifted it)
        const movedIndex = this.poses.findIndex(p => p.frame === fromFrame);
        this.poses[movedIndex].frame = toFrame;
        this.rebuildSpline();
        this.events.fire('track.keyMoved', fromFrame, toFrame);
        return true;
    }

    copyKey(fromFrame: number, toFrame: number): boolean {
        if (fromFrame === toFrame) return false;

        const source = this.poses.find(p => p.frame === fromFrame);
        if (!source) return false;

        // Remove any existing pose at the target frame
        const toIndex = this.poses.findIndex(p => p.frame === toFrame);
        if (toIndex !== -1) {
            this.poses.splice(toIndex, 1);
        }

        // Clone the pose data to the new frame
        this.poses.push({
            name: `camera_${this.poses.length}`,
            frame: toFrame,
            position: source.position.clone(),
            target: source.target.clone()
        });

        this.rebuildSpline();
        this.events.fire('track.keyAdded', toFrame);
        return true;
    }

    evaluate(frame: number): void {
        this.onTimelineChange?.(frame);
    }

    clear(): void {
        this.poses.length = 0;
        this.onTimelineChange = null;
        this.events.fire('track.keysCleared');
    }

    snapshot(): Pose[] {
        return this.poses.map(p => ({
            name: p.name,
            frame: p.frame,
            position: p.position.clone(),
            target: p.target.clone()
        }));
    }

    restore(snapshot: unknown): void {
        this.poses = (snapshot as Pose[]).map(p => ({
            name: p.name,
            frame: p.frame,
            position: p.position.clone(),
            target: p.target.clone()
        }));
        this.rebuildSpline();
        this.events.fire('track.keysLoaded');
    }

    /**
     * Add a pose directly (used for deserialization and legacy import).
     */
    addPose(pose: Pose): void {
        if (pose.frame === undefined) {
            return;
        }

        // If a pose already exists at this frame, update it
        const idx = this.poses.findIndex(p => p.frame === pose.frame);
        if (idx !== -1) {
            this.poses[idx] = pose;
            this.rebuildSpline();
            this.events.fire('track.keyUpdated', pose.frame);
        } else {
            this.poses.push(pose);
            this.rebuildSpline();
            this.events.fire('track.keyAdded', pose.frame);
        }
    }

    /**
     * Get all poses (used for serialization and legacy consumers).
     */
    getPoses(): readonly Pose[] {
        return this.poses;
    }

    /**
     * Load poses from serialized data.
     */
    loadPoses(posesData: Pose[]): void {
        this.poses.length = 0;
        posesData.forEach((pose) => {
            this.poses.push(pose);
        });
        this.rebuildSpline();
        this.events.fire('track.keysLoaded');
    }

    private rebuildSpline(): void {
        const duration = this.events.invoke('timeline.frames');
        const smoothness = this.events.invoke('timeline.smoothness');

        const orderedPoses = this.poses.slice()
        .filter(a => a.frame < duration)
        .sort((a, b) => a.frame - b.frame);

        // construct the spline points to be interpolated
        const times = orderedPoses.map(p => p.frame);
        const points: number[] = [];
        for (let i = 0; i < orderedPoses.length; ++i) {
            const p = orderedPoses[i];
            points.push(p.position.x, p.position.y, p.position.z);
            points.push(p.target.x, p.target.y, p.target.z);
        }

        if (orderedPoses.length > 1) {
            const spline = CubicSpline.fromPointsLooping(duration, times, points, smoothness);
            const result: number[] = [];
            const pose = { position: new Vec3(), target: new Vec3() };

            this.onTimelineChange = (frame: number) => {
                spline.evaluate(frame, result);
                pose.position.set(result[0], result[1], result[2]);
                pose.target.set(result[3], result[4], result[5]);
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

    // Legacy support: expose poses
    events.function('camera.poses', () => {
        return track.getPoses();
    });

    // Legacy support: add pose directly
    events.on('camera.addPose', (pose: Pose) => {
        track.addPose(pose);
    });

    // Serialization

    events.function('docSerialize.poseSets', (): any[] => {
        const pack3 = (v: Vec3) => [v.x, v.y, v.z];
        const poses = track.getPoses();

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
        if (!poseSets || poseSets.length === 0) {
            return;
        }

        const fps = events.invoke('timeline.frameRate');

        const loadedPoses: Pose[] = poseSets[0].poses.map((docPose: any, index: number) => {
            return {
                name: docPose.name,
                frame: docPose.frame ?? (index * fps),
                position: new Vec3(docPose.position),
                target: new Vec3(docPose.target)
            };
        });

        track.loadPoses(loadedPoses);
    });
};

export { registerCameraPosesEvents, CameraAnimTrack, Pose };
