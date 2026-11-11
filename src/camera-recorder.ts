import { Vec3 } from 'playcanvas';
import type { EventHandle } from 'playcanvas';

import type { Pose } from './camera-poses';
import { AnimTrackEditOp } from './edit-ops';
import type { Events } from './events';

/**
 * Camera path recorder.
 *
 * While recording, the playhead advances in real time and the camera pose is
 * sampled at fixed frame intervals into a buffer. The user keeps full control
 * of the camera; the camera track's spline evaluation is suspended for the
 * duration (see CameraAnimTrack).
 *
 * Stopping commits the whole take as a single undoable AnimTrackEditOp that
 * replaces the previous track contents, resizes the timeline to the take and
 * starts playback from frame 0.
 */
const registerCameraRecorderEvents = (events: Events) => {
    let recording = false;
    let animHandle: EventHandle = null;

    // sampled poses, in capture order
    let poses: Pose[] = [];
    let lastSampledFrame = -1;

    // playhead position in (fractional) frames while recording
    let time = 0;

    events.function('recorder.recording', () => recording);

    // frames captured so far, for live display on the timeline
    events.function('recorder.samples', () => poses.map((p) => p.frame));

    const capture = (frame: number) => {
        const pose = events.invoke('camera.getPose');
        poses.push({
            name: `camera_${poses.length}`,
            frame,
            position: new Vec3(pose.position.x, pose.position.y, pose.position.z),
            target: new Vec3(pose.target.x, pose.target.y, pose.target.z),
            fov: pose.fov
        });
        lastSampledFrame = frame;
        events.fire('recorder.sampled', frame);
    };

    const stop = (commit: boolean) => {
        if (!recording) return;
        animHandle.off();
        animHandle = null;

        const frames = events.invoke('timeline.frames');
        const finalFrame = Math.min(Math.floor(time), frames - 1);

        recording = false;
        events.fire('recorder.recording', false);

        // a discarded take leaves the track untouched
        if (!commit) return;

        // capture the pose where the take ended, unless a sample just landed there
        if (finalFrame >= 0 && finalFrame !== lastSampledFrame) {
            capture(finalFrame);
        }

        if (poses.length === 0) return;

        // replace the whole track in a single undo step, like track.addKey
        const track = events.invoke('camera.animTrack');
        const before = track.snapshot();
        const after = poses.slice().sort((a, b) => a.frame - b.frame);
        track.restore(after);
        events.fire('edit.add', new AnimTrackEditOp('recordTake', track, before, after), true);

        // size the timeline to the take, then replay it from the start
        const takeFrames = after[after.length - 1].frame + 1;
        if (takeFrames !== frames) {
            events.fire('timeline.setFrames', takeFrames);
        }
        events.fire('timeline.setFrame', 0);
        events.fire('timeline.setPlaying', true);
    };

    const start = (interval: number) => {
        if (recording) return;

        poses = [];
        lastSampledFrame = -1;
        time = 0;

        // recording drives the playhead, so pause playback first
        if (events.invoke('timeline.playing')) {
            events.fire('timeline.setPlaying', false);
        }
        events.fire('timeline.setFrame', 0);

        recording = true;
        events.fire('recorder.recording', true);

        animHandle = events.on('update', (dt: number) => {
            time += dt * events.invoke('timeline.frameRate');
            const frames = events.invoke('timeline.frames');
            const frame = Math.floor(time);

            // the take has filled the timeline: commit it
            if (frame >= frames) {
                stop(true);
                return;
            }

            events.fire('timeline.setFrame', frame);

            // sample at fixed frame boundaries, catching up over any skipped
            // frames after a stall (e.g. a backgrounded tab)
            let next = Math.ceil((lastSampledFrame + 1) / interval) * interval;
            while (next <= frame && next < frames) {
                capture(next);
                next += interval;
            }
        });
    };

    events.on('recorder.start', (interval: number) => {
        start(Math.max(1, Math.min(60, interval)));
    });

    events.on('recorder.stop', () => {
        stop(true);
    });

    // a scene clear during recording leaves nothing to commit
    events.on('scene.clear', () => {
        stop(false);
    });
};

export { registerCameraRecorderEvents };
