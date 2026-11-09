import { Vec3 } from 'playcanvas';

import type { Pose } from './camera-poses';
import type { CommandQueue } from './command-queue';
import { AnimTrackEditOp } from './edit-ops';
import type { CommandOptions } from './editor-command';
import { checkCancelled, EditorError } from './editor-command';
import type { EditorSession } from './editor-session';
import type { Events } from './events';
import type { Scene } from './scene';

type TimelineSettings = {
    frames?: number;
    frameRate?: number;
    smoothness?: number;
    loop?: boolean;
    frame?: number;
    playing?: boolean;
};
// omitted fields come from the playhead and camera when the command runs
type KeyInput = { frame?: number; position?: Vec3; target?: Vec3; fov?: number };
type KeyInfo = { frame: number; position: Vec3; target: Vec3; fov: number; inRange: boolean };

// the timeline panel's choices; other rates would leave its select blank
const FRAME_RATES = [1, 6, 12, 24, 30, 60];
const MAX_FRAMES = 10000;

const invalid = (message: string): never => {
    throw new EditorError('invalid_input', message);
};
const checkFrame = (frame: number, name = 'frame') => {
    if (!Number.isInteger(frame) || frame < 0) invalid(`${name} must be a non-negative integer.`);
};
const checkUnique = (frames: number[]) => {
    const duplicate = frames.find((frame, i) => frames.indexOf(frame) !== i);
    if (duplicate !== undefined) invalid(`Frame ${duplicate} appears more than once.`);
};

// Timeline playback settings and the camera keyframe track behind EditorAPI.
// Settings are session/document state outside history, as in the timeline
// panel. Key edits are single AnimTrackEditOps, so one command is one undo
// step and undo restores the whole track exactly.
const createEditorTimeline = (
    events: Events,
    scene: Scene,
    queue: CommandQueue,
    session: Pick<EditorSession, 'camera' | 'viewport'>,
    historyInfo: () => { canUndo: boolean; canRedo: boolean }
) => {
    const track = () => events.invoke('camera.animTrack');
    const keyInfo = (pose: Pose, frames: number): KeyInfo => ({
        frame: pose.frame,
        position: pose.position.clone(),
        target: pose.target.clone(),
        fov: pose.fov,
        inRange: pose.frame < frames
    });
    const state = () => {
        const frames = events.invoke('timeline.frames');
        const frameRate = events.invoke('timeline.frameRate');
        const keys = track().keys;
        return {
            frames,
            frameRate,
            duration: frames / frameRate,
            frame: events.invoke('timeline.frame'),
            playing: events.invoke('timeline.playing'),
            smoothness: events.invoke('timeline.smoothness'),
            loop: events.invoke('timeline.loop'),
            totalKeys: keys.length,
            outOfRangeKeys: keys.filter((k) => k >= frames).length
        };
    };
    const checkInRange = (frame: number) => {
        const frames = events.invoke('timeline.frames');
        if (frame >= frames)
            invalid(`Frame ${frame} is beyond the timeline (frames 0-${frames - 1}). Lengthen the timeline first.`);
    };
    const keyNotFound = (frame: number) =>
        new EditorError('key_not_found', `No key at frame ${frame}. Read the timeline again.`);

    // The camera track re-evaluates synchronously whenever keys or the
    // playhead change; apply its pose now so the result and the next
    // viewToken describe what renders. A PLY sequence swaps in its frame
    // asynchronously, so wait for that too unless playback keeps moving on.
    const settle = async (affected: number, keys?: KeyInfo[]) => {
        if (!events.invoke('timeline.playing')) await events.invoke('sequence.idle');
        scene.camera.onUpdate(0);
        scene.forceRender = true;
        return {
            affected,
            timeline: state(),
            ...(keys ? { keys } : {}),
            camera: session.camera(),
            viewport: session.viewport.info(),
            history: historyInfo()
        };
    };
    // fn returns the whole resulting track; edits replace poses rather than
    // mutate them, so the before snapshot stays intact for undo
    const editKeys = <E extends object>(
        options: CommandOptions | undefined,
        fn: (poses: Pose[]) => { name: string; poses: Pose[]; affected: number; report: number[]; extra: E }
    ) =>
        queue.enqueue(async (ctx) => {
            checkCancelled(options);
            session.viewport.assertIdle();
            const camera = track();
            const before = camera.snapshot();
            const edit = fn(before.slice());
            if (edit.affected) await ctx.apply(new AnimTrackEditOp(edit.name, camera, before, edit.poses));
            const frames = events.invoke('timeline.frames');
            const reported = edit.report.map((frame) => edit.poses.find((p) => p.frame === frame));
            const keys = reported.length ? reported.map((pose) => keyInfo(pose, frames)) : undefined;
            return { ...(await settle(edit.affected, keys)), ...edit.extra };
        });

    return {
        // for get_scene, which reads it inside its own queue slot
        summary: state,
        inspect: (options?: CommandOptions) =>
            queue.enqueue(() => {
                checkCancelled(options);
                const frames = events.invoke('timeline.frames');
                const keys = track()
                    .getPoses()
                    .slice()
                    .sort((a, b) => a.frame - b.frame)
                    .map((p) => keyInfo(p, frames));
                return { ...state(), keys };
            }),
        update: async (changes: TimelineSettings, options?: CommandOptions) => {
            const c = { ...changes };
            if (c.frames !== undefined && (!Number.isInteger(c.frames) || c.frames < 1 || c.frames > MAX_FRAMES))
                invalid(`frames must be an integer from 1 to ${MAX_FRAMES}.`);
            if (c.frameRate !== undefined && !FRAME_RATES.includes(c.frameRate))
                invalid(`frameRate must be one of ${FRAME_RATES.join(', ')}.`);
            if (c.smoothness !== undefined && !(c.smoothness >= 0 && c.smoothness <= 1))
                invalid('smoothness must be from 0 to 1.');
            if (c.frame !== undefined) checkFrame(c.frame);
            return await queue.enqueue(async () => {
                checkCancelled(options);
                session.viewport.assertIdle();
                const frames = c.frames ?? events.invoke('timeline.frames');
                if (c.frame !== undefined && c.frame >= frames)
                    invalid(`frame must be below the timeline length (${frames}).`);
                const before = state();
                // pause first: playback would overwrite a moved playhead on its next tick
                if (before.playing && (c.frame !== undefined || c.playing === false))
                    events.fire('timeline.setPlaying', false);
                if (c.frames !== undefined) events.fire('timeline.setFrames', c.frames);
                if (c.frameRate !== undefined) events.fire('timeline.setFrameRate', c.frameRate);
                if (c.smoothness !== undefined) events.fire('timeline.setSmoothness', c.smoothness);
                if (c.loop !== undefined) events.fire('timeline.setLoop', c.loop);
                if (c.frame !== undefined) events.fire('timeline.setFrame', c.frame);
                // a seek to the current frame fires nothing, and playback leaves the camera
                // between frames: evaluate so a manually moved camera returns to the path
                if (c.frame !== undefined || (before.playing && c.playing === false))
                    track().evaluate(events.invoke('timeline.frame'));
                if (c.playing ?? before.playing) events.fire('timeline.setPlaying', true);
                const after = state();
                const fields = ['frames', 'frameRate', 'smoothness', 'loop', 'frame', 'playing'] as const;
                return await settle(fields.filter((f) => c[f] !== undefined && before[f] !== after[f]).length);
            });
        },
        setKeys: async (keys: KeyInput[], options?: CommandOptions) => {
            const requested = keys.map((k) => ({ ...k, position: k.position?.clone(), target: k.target?.clone() }));
            if (!requested.length) invalid('Provide at least one key.');
            for (const k of requested) {
                if (k.frame !== undefined) checkFrame(k.frame);
                if (!!k.position !== !!k.target) invalid('position and target must be supplied together.');
                if (k.position?.equals(k.target)) invalid('Camera position and target must differ.');
                if (k.fov !== undefined && !(k.fov > 0 && k.fov < 180)) invalid('fov must be between 0 and 180.');
            }
            return await editKeys(options, (poses) => {
                // an omitted frame is the playhead when the command runs, like Add Key
                const playhead = events.invoke('timeline.frame');
                const input = requested.map((k) => ({ ...k, frame: k.frame ?? playhead }));
                checkUnique(input.map((k) => k.frame));
                input.forEach((k) => checkInRange(k.frame));
                const capture = input.some((k) => !k.position || k.fov === undefined);
                if (capture && events.invoke('timeline.playing'))
                    throw new EditorError('timeline_playing', 'Pause playback before capturing the camera pose.');
                const pose = capture ? events.invoke('camera.getPose') : null;
                let affected = 0;
                for (const k of input) {
                    const value = {
                        position: k.position ?? new Vec3(pose.position.x, pose.position.y, pose.position.z),
                        target: k.target ?? new Vec3(pose.target.x, pose.target.y, pose.target.z),
                        fov: k.fov ?? pose.fov
                    };
                    const index = poses.findIndex((p) => p.frame === k.frame);
                    const existing = poses[index];
                    if (
                        existing?.position.equals(value.position) &&
                        existing.target.equals(value.target) &&
                        existing.fov === value.fov
                    )
                        continue;
                    affected++;
                    // new keys are named as the track names them
                    const key = { name: existing?.name ?? `camera_${poses.length}`, frame: k.frame, ...value };
                    if (existing) poses[index] = key;
                    else poses.push(key);
                }
                return { name: 'setKeys', poses, affected, report: input.map((k) => k.frame), extra: {} };
            });
        },
        moveKey: async (
            from: number,
            to: number,
            { copy = false, overwrite = false }: { copy?: boolean; overwrite?: boolean } = {},
            options?: CommandOptions
        ) => {
            checkFrame(from, 'from');
            checkFrame(to, 'to');
            if (from === to) invalid('from and to must differ.');
            return await editKeys(options, (poses) => {
                const source = poses.find((p) => p.frame === from);
                if (!source) throw keyNotFound(from);
                // keys stranded beyond the end can be moved back, but never out
                checkInRange(to);
                const replaced = poses.some((p) => p.frame === to);
                // agents can't see the destination the way a dragging user can
                if (replaced && !overwrite)
                    throw new EditorError(
                        'key_exists',
                        `Frame ${to} already has a key. Pass overwrite: true to replace it.`
                    );
                const next = poses.filter((p) => p.frame !== to && (copy || p !== source));
                next.push({ ...source, name: copy ? `camera_${next.length}` : source.name, frame: to });
                return {
                    name: copy ? 'copyKey' : 'moveKey',
                    poses: next,
                    affected: 1,
                    report: [to],
                    extra: { replaced }
                };
            });
        },
        deleteKeys: async (frameList: number[], options?: CommandOptions) => {
            const targets = [...frameList];
            if (!targets.length) invalid('Provide at least one frame.');
            targets.forEach((frame) => checkFrame(frame));
            checkUnique(targets);
            return await editKeys(options, (poses) => {
                const missing = targets.find((frame) => !poses.some((p) => p.frame === frame));
                if (missing !== undefined) throw keyNotFound(missing);
                return {
                    name: 'deleteKeys',
                    poses: poses.filter((p) => !targets.includes(p.frame)),
                    affected: targets.length,
                    report: [],
                    extra: { deleted: targets.sort((a, b) => a - b) }
                };
            });
        }
    };
};

export { createEditorTimeline };
export type { TimelineSettings, KeyInput, KeyInfo };
