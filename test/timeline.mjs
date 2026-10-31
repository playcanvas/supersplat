import assert from 'node:assert/strict';
import { Vec3 } from 'playcanvas';

import { registerCameraPosesEvents } from './.build/src/camera-poses.js';
import { registerTimelineEvents } from './.build/src/timeline.js';
import { createWebMCPTools } from './.build/src/webmcp.js';
import { setup } from './editor-commands.mjs';

const use = async (fn) => {
    const state = setup();
    const { events, scene, api } = state;
    registerTimelineEvents(events);
    registerCameraPosesEvents(events);
    let camera = { position: new Vec3(6, 2, 6), target: new Vec3(0, 1, 0), fov: 60 };
    events.function('camera.getPose', () => camera);
    events.function('camera.fov', () => camera.fov);
    events.on('camera.setPose', pose => {
        camera = { position: pose.position.clone(), target: pose.target.clone(), fov: pose.fov };
    });
    scene.camera = { onUpdate() {} };
    api.viewport.ready = () => Promise.resolve(true);
    const tools = new Map(createWebMCPTools(api).map(tool => [tool.name, tool]));
    const call = (name, input = {}, options) => tools.get(name).execute(input, options);
    try {
        await fn({ ...state, call, camera: () => camera, setCamera: pose => { camera = pose; } });
    } finally {
        events.fire('timeline.setPlaying', false);
        state.layers.forEach(layer => layer.instances.destroy());
    }
};
const start = { frame: 0, position: [6, 2, 6], target: [0, 1, 0], fov: 60 };
const end = { frame: 299, position: [-6, 4, 6], target: [0, 1, 0], fov: 80 };
const tenSeconds = { frames: 300, frameRate: 30, loop: false, smoothness: 0 };
const frames = async call => (await call('get_timeline')).keyframes.map(key => key.frame);

const checks = {
    async 'timeline tools author and evaluate a ten-second camera animation'() {
        await use(async ({ call, camera, setCamera }) => {
            assert.equal((await call('set_timeline', tenSeconds)).timeline.duration, 10);
            await call('set_camera_keyframe', start);
            await call('set_camera_keyframe', end);
            await call('set_timeline', { frame: 299 });
            assert.equal(camera().position.x, -6);
            assert.equal(camera().fov, 80);
            await call('set_timeline', { frame: 149 });
            assert(Math.abs(camera().position.x) < 0.1);
            assert(Math.abs(camera().fov - 70) < 0.1);
            setCamera({ position: new Vec3(9, 3, 7), target: new Vec3(1, 1, 0), fov: 55 });
            const captured = await call('set_camera_keyframe', { frame: 90 });
            assert.deepEqual(captured.keyframe.position, [9, 3, 7]);
            assert.equal(captured.keyframe.fov, 55);
            assert.equal(captured.timeline.frame, 149);
            await call('set_timeline', { frame: 0 });
            setCamera({ position: new Vec3(20, 3, 7), target: new Vec3(1, 1, 0), fov: 55 });
            await call('set_timeline', { frame: 0 });
            assert.equal(camera().position.x, 6);
            assert.equal(camera().fov, 60);
            const listed = await call('get_timeline', { offset: 1, limit: 1 });
            assert.equal(listed.keyframes[0].frame, 90);
            assert.equal(listed.nextOffset, 2);
        });
    },

    async 'invalid timeline requests preserve playback, settings and history'() {
        await use(async ({ call, history }) => {
            await call('set_timeline', { ...tenSeconds, playing: true });
            for (const [name, input] of [
                ['set_timeline', { frames: 60, frame: 99 }],
                ['set_timeline', { frameRate: 25 }],
                ['set_timeline', { smoothness: NaN }],
                ['set_timeline', {}],
                ['set_camera_keyframe', { position: [1, 2, 3] }],
                ['set_camera_keyframe', { position: [1, 2, 3], target: [1, 2, 3] }],
                ['set_camera_keyframe', { frame: 300 }],
                ['set_camera_keyframe', { fov: 171 }]
            ]) {
                const result = await call(name, input);
                assert.equal(result.error?.code, 'invalid_input', name);
            }
            const { timeline } = await call('get_timeline');
            assert.equal(timeline.frames, 300);
            assert.equal(timeline.playing, true);
            assert.equal(history.cursor, 0);
        });
    },

    async 'camera keys move, copy, overwrite, remove and share undo history'() {
        await use(async ({ call, api, history }) => {
            await call('set_timeline', tenSeconds);
            await call('set_camera_keyframe', start);
            await call('set_camera_keyframe', end);
            await call('move_camera_keyframe', { fromFrame: 0, toFrame: 50, copy: true });
            assert.deepEqual(await frames(call), [0, 50, 299]);
            const collision = await call('move_camera_keyframe', { fromFrame: 299, toFrame: 50 });
            assert.equal(collision.error.code, 'keyframe_exists');
            await call('move_camera_keyframe', { fromFrame: 299, toFrame: 50, overwrite: true });
            assert.deepEqual(await frames(call), [0, 50]);
            await api.history.undo();
            assert.deepEqual(await frames(call), [0, 50, 299]);
            await api.history.redo();
            assert.deepEqual(await frames(call), [0, 50]);
            const cursor = history.cursor;
            assert.equal((await call('move_camera_keyframe', { fromFrame: 50, toFrame: 50 })).changed, false);
            assert.equal((await call('remove_camera_keyframe', { frame: 299 })).changed, false);
            assert.equal(history.cursor, cursor);
            const replaced = await call('set_camera_keyframe', { ...end, frame: 50, fov: 45 });
            assert.equal(replaced.replaced, true);
            assert.equal(replaced.keyframe.fov, 45);
            await api.history.undo();
            assert.equal((await call('get_timeline')).keyframes[1].fov, 80);
            await call('remove_camera_keyframe', { frame: 50 });
            await api.history.undo();
            assert.deepEqual(await frames(call), [0, 50]);
        });
    },

    async 'shortening the timeline retains keys and clamps the playhead'() {
        await use(async ({ call, api }) => {
            await call('set_timeline', tenSeconds);
            await call('set_camera_keyframe', start);
            await call('set_camera_keyframe', end);
            await call('set_timeline', { frame: 299 });
            const shortened = await call('set_timeline', { frames: 40 });
            assert.equal(shortened.timeline.frame, 39);
            const keys = await call('get_timeline');
            assert.equal(keys.keyframes[1].inRange, false);
            const snapshot = await api.timeline.get();
            snapshot.keyframes[0].position.set(100, 100, 100);
            assert.equal((await api.timeline.get()).keyframes[0].position.x, 6);
            await call('move_camera_keyframe', { fromFrame: 299, toFrame: 30 });
            assert.deepEqual(await frames(call), [0, 30]);
            await api.history.undo();
            await call('remove_camera_keyframe', { frame: 299 });
            assert.deepEqual(await frames(call), [0]);
            await call('set_timeline', { frames: 1, frame: 0 });
            assert.equal((await call('get_timeline')).timeline.frames, 1);
        });
    },

    async 'timeline commands snapshot inputs and commit before a queued UI undo'() {
        await use(async ({ api, queue, history }) => {
            let release;
            const gate = new Promise(resolve => { release = resolve; });
            queue.enqueue(() => gate);
            const settings = { frame: 0, position: new Vec3(2, 3, 4), target: new Vec3(), fov: 65 };
            const pending = api.timeline.setKey(settings);
            const undo = history.undo();
            settings.position.set(100, 100, 100);
            release();
            const result = await pending;
            await undo;
            assert.equal(result.keyframe.position.x, 2);
            assert.equal(result.timeline.keyframeCount, 1);
            assert.equal((await api.timeline.get()).timeline.keyframeCount, 0);
            assert.equal(history.canRedo(), true);
        });
    },

    async 'cancelled or busy timeline commands cannot commit or pause playback'() {
        await use(async ({ api, events, queue, history, scene }) => {
            await api.timeline.set({ playing: true });
            let release;
            const gate = new Promise(resolve => { release = resolve; });
            queue.enqueue(() => gate);
            const controller = new AbortController();
            const pending = api.timeline.setKey({}, { signal: controller.signal });
            const rejected = assert.rejects(pending, error => error.code === 'cancelled');
            controller.abort();
            release();
            await rejected;
            assert.equal(history.cursor, 0);
            assert.equal(events.invoke('timeline.playing'), true);
            scene.lockedRenderMode = 'video';
            await assert.rejects(api.timeline.setKey({}), error => error.code === 'busy');
            assert.equal(history.cursor, 0);
            assert.equal(events.invoke('timeline.playing'), true);
            scene.lockedRenderMode = null;
            assert.equal((await api.timeline.setKey({})).timeline.playing, false);
        });
    }
};

export { checks as timelineChecks };
