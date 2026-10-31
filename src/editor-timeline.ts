import { Vec3 } from 'playcanvas';

import type { CameraAnimTrack, Pose } from './camera-poses';
import type { CommandContext, CommandQueue } from './command-queue';
import { AnimTrackEditOp } from './edit-ops';
import type { CommandOptions } from './editor-command';
import { checkCancelled, EditorError } from './editor-command';
import type { Events } from './events';
import type { Scene } from './scene';

type TimelineSettings = {
    frames?: number;
    frameRate?: number;
    frame?: number;
    smoothness?: number;
    loop?: boolean;
    playing?: boolean;
};
type CameraKeyframeSettings = { frame?: number; position?: Vec3; target?: Vec3; fov?: number };
type MoveKeyframeSettings = { fromFrame: number; toFrame: number; copy?: boolean; overwrite?: boolean };

const MAX_FRAMES = 10000;
const FRAME_RATES = [1, 6, 12, 24, 30, 60];
const invalid = (message: string): never => {
    throw new EditorError('invalid_input', message);
};
const numeric = (value: number, name: string, min: number, max: number, whole = false) => {
    if (!Number.isFinite(value) || value < min || value > max || (whole && !Number.isInteger(value)))
        invalid(`${name} must be ${whole ? 'an integer' : 'a number'} between ${min} and ${max}.`);
};

// Timeline commands own one queue slot, just like the other EditorAPI methods.
// Build key snapshots without mutating the live track, then commit through the
// same AnimTrackEditOp used by the UI's track manager.
const createEditorTimeline = (events: Events, scene: Scene, queue: CommandQueue, assertIdle: () => void) => {
    const track = () => events.invoke('camera.animTrack') as CameraAnimTrack;
    const read = () => {
        const frames = events.invoke('timeline.frames') as number;
        const frameRate = events.invoke('timeline.frameRate') as number;
        const frame = events.invoke('timeline.frame') as number;
        return {
            frames,
            frameRate,
            duration: frames / frameRate,
            frame,
            time: frame / frameRate,
            playing: events.invoke('timeline.playing') as boolean,
            smoothness: events.invoke('timeline.smoothness') as number,
            loop: events.invoke('timeline.loop') as boolean,
            keyframeCount: track().keys.length
        };
    };
    const keyInfo = (pose: Pose) => ({
        frame: pose.frame,
        position: pose.position.clone(),
        target: pose.target.clone(),
        fov: pose.fov,
        inRange: pose.frame < events.invoke('timeline.frames')
    });
    const withinTimeline = (frame: number, name = 'frame') =>
        numeric(frame, name, 0, events.invoke('timeline.frames') - 1, true);
    const refresh = () => {
        scene.camera.onUpdate(0);
        scene.forceRender = true;
    };
    const edit = <T extends { changed: boolean }>(
        name: string,
        mutate: (poses: Pose[]) => T,
        options?: CommandOptions
    ) =>
        queue.enqueue(async (ctx: CommandContext) => {
            checkCancelled(options);
            assertIdle();
            const cameraTrack = track();
            const before = cameraTrack.snapshot();
            const after = cameraTrack.snapshot();
            // Validation and capture finish synchronously before pausing, so
            // rejected input leaves playback and the current view untouched.
            const result = mutate(after);
            events.fire('timeline.setPlaying', false);
            if (result.changed) await ctx.apply(new AnimTrackEditOp(name, cameraTrack, before, after));
            refresh();
            return { ...result, timeline: read() };
        });

    return {
        read,
        get: async (settings: { offset?: number; limit?: number } = {}, options?: CommandOptions) => {
            const offset = settings.offset ?? 0;
            const limit = settings.limit ?? 32;
            return await queue.enqueue(() => {
                checkCancelled(options);
                numeric(offset, 'offset', 0, Number.MAX_SAFE_INTEGER, true);
                numeric(limit, 'limit', 1, 128, true);
                const poses = track()
                    .getPoses()
                    .slice()
                    .sort((a, b) => a.frame - b.frame);
                return {
                    timeline: read(),
                    keyframes: poses.slice(offset, offset + limit).map(keyInfo),
                    nextOffset: offset + limit < poses.length ? offset + limit : null
                };
            });
        },
        set: async (settings: TimelineSettings, options?: CommandOptions) => {
            const s = { ...settings };
            return await queue.enqueue(() => {
                checkCancelled(options);
                assertIdle();
                if (!Object.values(s).some((v) => v !== undefined)) invalid('Provide a timeline setting.');
                if (s.frames !== undefined) numeric(s.frames, 'frames', 1, MAX_FRAMES, true);
                if (s.frameRate !== undefined && !FRAME_RATES.includes(s.frameRate))
                    invalid(`frameRate must be one of: ${FRAME_RATES.join(', ')}.`);
                if (s.frame !== undefined) numeric(s.frame, 'frame', 0, (s.frames ?? read().frames) - 1, true);
                if (s.smoothness !== undefined) numeric(s.smoothness, 'smoothness', 0, 1);
                for (const key of ['loop', 'playing'] as const)
                    if (s[key] !== undefined && typeof s[key] !== 'boolean') invalid(`${key} must be a boolean.`);
                events.fire('timeline.setPlaying', false);
                if (s.frames !== undefined) events.fire('timeline.setFrames', s.frames);
                if (s.frameRate !== undefined) events.fire('timeline.setFrameRate', s.frameRate);
                if (s.smoothness !== undefined) events.fire('timeline.setSmoothness', s.smoothness);
                if (s.loop !== undefined) events.fire('timeline.setLoop', s.loop);
                if (s.frame !== undefined) events.fire('timeline.setFrame', s.frame);
                // A same-frame seek must also restore a manually moved camera.
                track().evaluate(events.invoke('timeline.frame'));
                refresh();
                if (s.playing === true) events.fire('timeline.setPlaying', true);
                return { timeline: read() };
            });
        },
        setKey: async (settings: CameraKeyframeSettings = {}, options?: CommandOptions) => {
            const s = { ...settings, position: settings.position?.clone(), target: settings.target?.clone() };
            return await edit(
                'addKey',
                (poses) => {
                    const frame = s.frame ?? events.invoke('timeline.frame');
                    withinTimeline(frame);
                    if (!!s.position !== !!s.target) invalid('position and target must be supplied together.');
                    if (s.position?.equals(s.target)) invalid('Camera position and target must differ.');
                    for (const v of [s.position, s.target])
                        if (v && ![v.x, v.y, v.z].every(Number.isFinite)) invalid('Camera vectors must be finite.');
                    if (s.fov !== undefined) numeric(s.fov, 'fov', 5, 170);
                    const current = events.invoke('camera.getPose');
                    const index = poses.findIndex((p) => p.frame === frame);
                    const key: Pose = {
                        name: index === -1 ? `camera_${frame}` : poses[index].name,
                        frame,
                        position: s.position ?? new Vec3(current.position.x, current.position.y, current.position.z),
                        target: s.target ?? new Vec3(current.target.x, current.target.y, current.target.z),
                        fov: s.fov ?? current.fov
                    };
                    if (index === -1) poses.push(key);
                    else poses[index] = key;
                    return { changed: true, replaced: index !== -1, keyframe: keyInfo(key) };
                },
                options
            );
        },
        removeKey: async (frame: number, options?: CommandOptions) =>
            await edit(
                'removeKey',
                (poses) => {
                    numeric(frame, 'frame', 0, Number.MAX_SAFE_INTEGER, true);
                    const index = poses.findIndex((p) => p.frame === frame);
                    if (index !== -1) poses.splice(index, 1);
                    return { changed: index !== -1 };
                },
                options
            ),
        moveKey: async (settings: MoveKeyframeSettings, options?: CommandOptions) => {
            const s = { ...settings };
            return await edit(
                s.copy ? 'copyKey' : 'moveKey',
                (poses) => {
                    numeric(s.fromFrame, 'fromFrame', 0, Number.MAX_SAFE_INTEGER, true);
                    withinTimeline(s.toFrame, 'toFrame');
                    for (const key of ['copy', 'overwrite'] as const)
                        if (s[key] !== undefined && typeof s[key] !== 'boolean') invalid(`${key} must be a boolean.`);
                    const source = poses.find((p) => p.frame === s.fromFrame);
                    if (!source)
                        throw new EditorError('keyframe_not_found', `No camera keyframe at frame ${s.fromFrame}.`);
                    if (s.fromFrame === s.toFrame) return { changed: false };
                    const destination = poses.findIndex((p) => p.frame === s.toFrame);
                    if (destination !== -1 && !s.overwrite)
                        throw new EditorError(
                            'keyframe_exists',
                            'The destination has a key; pass overwrite: true to replace it.'
                        );
                    if (destination !== -1) poses.splice(destination, 1);
                    if (s.copy) poses.push({ ...source, frame: s.toFrame });
                    else source.frame = s.toFrame;
                    return { changed: true };
                },
                options
            );
        }
    };
};

export { createEditorTimeline };
export type { TimelineSettings, CameraKeyframeSettings, MoveKeyframeSettings };
