import type { EventHandle } from 'playcanvas';

import type { Pose } from './camera-poses';
import { createPose } from './camera-poses';
import { AnimTrackEditOp } from './edit-ops';
import { MAX_FRAMES } from './editor-timeline';
import type { Events } from './events';

/**
 * Camera path recorder.
 *
 * While recording, the playhead advances in real time from wherever it was and
 * the camera pose is sampled at fixed frame intervals into a buffer. The user
 * keeps full control of the camera; the camera track's spline evaluation is
 * suspended for the duration (see CameraAnimTrack).
 *
 * Starting a take arms it: the playhead stays where it was until the camera
 * actually moves, so the time between clicking record and starting to move the
 * camera is not captured.
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

    // whether this take grew the timeline (an unclipped take outgrowing its
    // length); only then does cancelling restore the starting length
    let grewFrames = false;

    // an armed take waits for the camera to move before it starts recording;
    // armedPose is the pose the take begins from
    let armed = false;
    let armedPose: Pose = null;

    // the clip the take is confined to (null when the whole timeline is open)
    let takeRange: { start: number; end: number } = null;

    events.function('recorder.recording', () => recording);

    // first frame of the running take (-1 when idle), so the strip can show
    // which keys the take is about to replace
    events.function('recorder.startFrame', () => (recording ? startFrame : -1));

    // frames captured so far, for live display on the timeline
    events.function('recorder.samples', () => poses.map((p) => p.frame));

    // the camera as a pose on the given frame
    const poseAt = (frame: number): Pose =>
        createPose(events.invoke('camera.getPose'), frame, `camera_${poses.length}`);

    const capture = (frame: number) => {
        poses.push(poseAt(frame));
        lastSampledFrame = frame;
        events.fire('recorder.sampled', frame);
    };

    // whether the camera has left the pose it was armed at. The thresholds are
    // tiny but non-zero, so tween settling does not start the take while any
    // real input does (keyboard, drag, wheel or a pose command).
    const cameraMoved = () => {
        const pose = events.invoke('camera.getPose');
        const a = armedPose.position;
        const b = pose.position;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        if (dx * dx + dy * dy + dz * dz > 1e-8) return true;

        // view direction
        const ax = armedPose.target.x - a.x;
        const ay = armedPose.target.y - a.y;
        const az = armedPose.target.z - a.z;
        const bx = pose.target.x - b.x;
        const by = pose.target.y - b.y;
        const bz = pose.target.z - b.z;
        const la = Math.hypot(ax, ay, az);
        const lb = Math.hypot(bx, by, bz);
        if (la > 0 && lb > 0 && (ax * bx + ay * by + az * bz) / (la * lb) < 1 - 1e-9) return true;

        return Math.abs((pose.roll ?? 0) - (armedPose.roll ?? 0)) > 1e-3;
    };

    const stop = (commit: boolean, restoreFrames = true) => {
        if (!recording) return;
        animHandle.off();
        animHandle = null;

        const frames = events.invoke('timeline.frames');
        // a clipped take never runs past its clip, even if the clip shrank or
        // the stop arrives late
        const liveRange = events.invoke('timeline.clipRange');
        const takeEnd = liveRange ? liveRange.end : takeRange ? takeRange.end : -1;
        const clipEnd = takeEnd >= 0 ? Math.min(takeEnd, frames - 1) : -1;
        const finalFrame = Math.min(Math.floor(time), frames - 1, clipEnd >= 0 ? clipEnd : frames - 1);

        recording = false;
        // a take stopped before the camera moved, or left without a playable
        // interval by a timeline shrink, recorded nothing
        const invalidInterval = clipEnd >= 0 && startFrame > clipEnd;
        const cancelled = !commit || armed || invalidInterval;
        const range = takeRange;
        armed = false;
        armedPose = null;
        takeRange = null;
        events.fire('recorder.recording', false);

        // a cancelled take leaves the track untouched, but the timeline length
        // growth the recorder itself caused is undone
        if (cancelled) {
            if (restoreFrames && grewFrames && events.invoke('timeline.frames') !== framesAtStart) {
                events.fire('timeline.setFrames', framesAtStart);
            }
            return;
        }

        // a clip that shrank while the take ran drops samples past its end
        if (clipEnd >= 0) {
            poses = poses.filter((p) => p.frame <= clipEnd);
            lastSampledFrame = poses.length > 0 ? poses[poses.length - 1].frame : -1;
        }

        // capture the pose where the take ended, unless a sample just landed there
        if (finalFrame >= 0 && finalFrame !== lastSampledFrame) {
            capture(finalFrame);
        }

        if (poses.length === 0) return;

        // punch the take into the track in a single undo step, like
        // track.addKey. An open take replaces everything from its start; a
        // clipped take replaces only the interval it covered, so keys later in
        // the clip survive an early stop.
        const lastCovered = poses[poses.length - 1].frame;
        const track = events.invoke('camera.animTrack');
        const before = track.snapshot();
        const kept = (before as Pose[]).filter((p) =>
            range ? p.frame < startFrame || p.frame > lastCovered : p.frame < startFrame
        );
        const after = [...kept, ...poses].sort((a, b) => a.frame - b.frame);
        track.restore(after);
        events.fire('edit.add', new AnimTrackEditOp('recordTake', track, before, after), true);

        if (range) {
            // the clip already bounds the take: keep the timeline length and
            // leave the playhead on the last captured frame
            events.fire('timeline.setFrame', lastCovered);
            events.fire('timeline.setPlaying', false);
            return;
        }

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
        grewFrames = false;

        // continue from the playhead: a take started mid-timeline punches in
        // instead of wiping the track and restarting from frame 0
        startFrame = Math.max(0, Math.min(events.invoke('timeline.frame'), framesAtStart - 1));
        time = startFrame;

        // a clip bounds the take: it commits at the clip's end instead of
        // growing the timeline
        takeRange = events.invoke('timeline.clipRange');

        // recording drives the playhead, so pause playback first
        if (events.invoke('timeline.playing')) {
            events.fire('timeline.setPlaying', false);
        }
        events.fire('timeline.setFrame', startFrame);

        recording = true;
        events.fire('recorder.recording', true);

        // arm the take. It starts when the camera moves, and its first key is
        // the pose at the playhead when record was clicked
        armed = true;
        armedPose = poseAt(startFrame);
        nextSample = startFrame + interval;

        animHandle = events.on('update', (dt: number) => {
            // the clip and the timeline length can change while the take runs,
            // so read them live
            let frames = events.invoke('timeline.frames');
            const liveRange = events.invoke('timeline.clipRange');
            const takeEnd = liveRange ? liveRange.end : takeRange ? takeRange.end : -1;
            const clipEnd = takeEnd >= 0 ? Math.min(takeEnd, frames - 1) : -1;

            if (armed) {
                if (!cameraMoved()) return;

                armed = false;
                // no playable frame after the start: record the pose the
                // movement produced rather than the one captured on click
                if (clipEnd >= 0 && startFrame >= clipEnd) {
                    poses.push(poseAt(startFrame));
                } else {
                    poses.push(armedPose);
                }
                lastSampledFrame = startFrame;
                events.fire('recorder.sampled', startFrame);
            }

            time += dt * events.invoke('timeline.frameRate');
            let frame = Math.floor(time);

            // the timeline shrank past the take's start: there is no interval
            // left to punch in, so end quietly and keep the new length
            if (clipEnd >= 0 && startFrame > clipEnd) {
                stop(false, false);
                return;
            }

            if (clipEnd >= 0 && frame >= clipEnd) {
                time = clipEnd;
                events.fire('timeline.setFrame', clipEnd);
                while (nextSample <= clipEnd) {
                    capture(nextSample);
                    nextSample += interval;
                }
                stop(true);
                return;
            }

            // the take has outgrown the timeline: extend it by a second and
            // keep recording instead of committing, so a take runs past the
            // total frames it started with until the user stops it
            if (frame >= frames) {
                // the timeline length is shared with the editor API and the
                // panel; at that limit finish the take instead of outgrowing it
                if (frames >= MAX_FRAMES) {
                    stop(true);
                    return;
                }
                frames = Math.min(MAX_FRAMES, frame + events.invoke('timeline.frameRate'));
                events.fire('timeline.setFrames', frames);
                grewFrames = true;
                frame = Math.min(frame, frames - 1);
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
