import { Vec3 } from 'playcanvas';
import type { EventHandle } from 'playcanvas';

import type { Pose } from './camera-poses';
import { AnimTrackEditOp } from './edit-ops';
import type { Events } from './events';

/**
 * Camera path recorder.
 *
 * While recording, the playhead advances in real time from wherever it was and
 * the camera pose is sampled at fixed frame intervals into a buffer. The user
 * keeps full control of the camera; the camera track's spline evaluation is
 * suspended for the duration (see CameraAnimTrack).
 *
 * A take is a punch-in: it starts at the playhead, keys before it are left
 * untouched and everything from there on is replaced by the new samples.
 *
 * The timeline is not a hard limit: when the take outgrows it, the recorder
 * extends the frame count by a second at a time and keeps recording, so a take
 * runs as long as the user keeps it running.
 *
 * Stopping commits the whole take as a single undoable AnimTrackEditOp that
 * merges the samples into the previous track, sizes the timeline to fit the
 * result and starts playback.
 */
const registerCameraRecorderEvents = (events: Events) => {
    let recording = false;
    let animHandle: EventHandle = null;

    // sampled poses, in capture order
    let poses: Pose[] = [];
    let lastSampledFrame = -1;

    // playhead position in (fractional) frames while recording
    let time = 0;

    // frame the take starts at, and the frame the next sample lands on
    let startFrame = 0;
    let nextSample = 0;

    // timeline length when the take started, so a discarded take can give
    // back the frames the recorder added while it ran
    let framesAtStart = 0;

    events.function('recorder.recording', () => recording);

    // first frame of the running take (-1 when idle), so the strip can show
    // which keys the take is about to replace
    events.function('recorder.startFrame', () => (recording ? startFrame : -1));

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

        // a discarded take leaves the track untouched, but the timeline length
        // growth it caused is undone
        if (!commit) {
            if (events.invoke('timeline.frames') !== framesAtStart) {
                events.fire('timeline.setFrames', framesAtStart);
            }
            return;
        }

        // capture the pose where the take ended, unless a sample just landed there
        if (finalFrame >= 0 && finalFrame !== lastSampledFrame) {
            capture(finalFrame);
        }

        if (poses.length === 0) return;

        // punch the take into the track in a single undo step, like
        // track.addKey: keys before the take are kept, and everything from the
        // take's start is replaced by the new samples
        const lastCovered = poses[poses.length - 1].frame;
        const track = events.invoke('camera.animTrack');
        const before = track.snapshot();
        const kept = (before as Pose[]).filter((p) => p.frame < startFrame);
        const after = [...kept, ...poses].sort((a, b) => a.frame - b.frame);
        track.restore(after);
        events.fire('edit.add', new AnimTrackEditOp('recordTake', track, before, after), true);

        // the take now defines the end of the animation
        const takeFrames = lastCovered + 1;
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
        framesAtStart = events.invoke('timeline.frames');

        // continue from the playhead: a take started mid-timeline punches in
        // instead of wiping the track and restarting from frame 0
        startFrame = Math.max(0, Math.min(events.invoke('timeline.frame'), framesAtStart - 1));
        time = startFrame;

        // recording drives the playhead, so pause playback first
        if (events.invoke('timeline.playing')) {
            events.fire('timeline.setPlaying', false);
        }
        events.fire('timeline.setFrame', startFrame);

        recording = true;
        events.fire('recorder.recording', true);

        // the pose at the playhead is the take's first key
        capture(startFrame);
        nextSample = startFrame + interval;

        animHandle = events.on('update', (dt: number) => {
            time += dt * events.invoke('timeline.frameRate');
            let frames = events.invoke('timeline.frames');
            const frame = Math.floor(time);

            // the take has outgrown the timeline: extend it by a second and
            // keep recording instead of committing, so a take runs past the
            // total frames it started with until the user stops it
            if (frame >= frames) {
                frames = frame + events.invoke('timeline.frameRate');
                events.fire('timeline.setFrames', frames);
            }

            events.fire('timeline.setFrame', frame);

            // sample every `interval` frames from the take's start, catching
            // up over any skipped frames after a stall (e.g. a backgrounded tab)
            while (nextSample <= frame) {
                capture(nextSample);
                nextSample += interval;
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
