import assert from 'node:assert/strict';
import { BoundingBox, Color, Mat4, Vec3 } from 'playcanvas';

import { registerCameraPosesEvents } from './.build/src/camera-poses.js';
import { registerTimelineEvents } from './.build/src/timeline.js';
import { createWebMCPTools, registerWebMCP } from './.build/src/webmcp.js';
import { setup } from './editor-commands.mjs';

const barrier = () => {
    let release;
    const promise = new Promise(resolve => { release = resolve; });
    return { promise, release };
};
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const quietly = async (fn) => {
    const original = console.error;
    console.error = () => {};
    try { return await fn(); } finally { console.error = original; }
};
const use = async (fn) => {
    const state = setup();
    state.api.viewport.ready = () => Promise.resolve(true);
    const tools = new Map(createWebMCPTools(state.api).map(tool => [tool.name, tool]));
    const call = (name, input = {}, options) => tools.get(name).execute(input, options);
    try { await fn({ ...state, tools, call }); } finally { state.layers.forEach(layer => layer.instances.destroy()); }
};
// The real timeline and camera track, driving a stub camera that holds the
// last pose applied to it, as the editor camera does at speed 0.
const useTimeline = fn => use(async (state) => {
    const { events, scene } = state;
    const camera = { position: new Vec3(0, 0, 10), target: new Vec3(), fov: 60 };
    events.function('camera.getPose', () => ({ position: { ...camera.position }, target: { ...camera.target }, fov: camera.fov }));
    events.function('camera.fov', () => camera.fov);
    events.on('camera.setPose', (pose) => {
        camera.position.copy(pose.position);
        camera.target.copy(pose.target);
        if (pose.fov !== undefined) camera.fov = pose.fov;
    });
    events.function('sequence.idle', () => Promise.resolve());
    scene.camera = {
        azim: 0, elevation: 0, distance: 1,
        onUpdate() {},
        captureFrame: () => ({
            position: camera.position.clone(), fov: camera.fov, ortho: false, target: { width: 1, height: 1 },
            view: new Mat4().setTranslate(-camera.position.x, -camera.position.y, -camera.position.z), projection: new Mat4()
        })
    };
    scene.canvas = { getBoundingClientRect: () => ({ x: 0, y: 0, width: 1, height: 1 }) };
    registerTimelineEvents(events);
    registerCameraPosesEvents(events);
    await fn({ ...state, camera });
});
const close = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-6);
const frames = async call => (await call('get_timeline')).keys.map(k => k.frame);

const checks = {
    async 'WebMCP rejects malformed input without mutating history'() {
        await use(async ({ call, history }) => {
            for (const input of [null, [], 'all', { layer: '0', mode: 'all' }, { layer: 0, mode: 'all', extra: true }, { layer: NaN, mode: 'all' }]) {
                const result = await call('set_selection', input);
                assert.equal(result.ok, false);
                assert.equal(result.error.code, 'invalid_input');
            }
            const scoped = await call('apply_color', { layer: 0, brightness: 0.2 });
            assert.equal(scoped.error.code, 'invalid_input');
            assert.equal(history.history.length, 0);
        });
    },

    async 'WebMCP snapshots arguments before waiting for an earlier request'() {
        await use(async ({ call, api, layers }) => {
            const gate = barrier();
            const inspect = api.inspect.layer;
            api.inspect.layer = async (...args) => { await gate.promise; return inspect(...args); };
            const first = call('get_layer', { layer: 0 });
            const args = { layer: 1, mode: 'all' };
            const second = call('set_selection', args);
            args.layer = 0;
            args.mode = 'none';
            gate.release();
            await first;
            assert.equal((await second).ok, true);
            assert.equal(layers[0].instances.numSelected, 0);
            assert.equal(layers[1].instances.numSelected, 3);
        });
    },

    async 'selection results are snapshots from their own command slots'() {
        await use(async ({ api }) => {
            const all = api.selection.all(0);
            const none = api.selection.none(0);
            assert.equal((await all).layers[0].selected, 3);
            assert.equal((await none).layers[0].selected, 0);
        });
    },

    async 'no-op selection does not create an undo entry'() {
        await use(async ({ call, history }) => {
            const result = await call('set_selection', { layer: 0, mode: 'none' });
            assert.equal(result.ok, true);
            assert.equal(result.affected, 0);
            assert.equal(history.history.length, 0);
        });
    },

    async 'MCP volume readback commits before a UI undo queued during it'() {
        await use(async ({ api, scene, layers, history }) => {
            const gate = barrier();
            let released = 0;
            scene.dataProcessor = {
                intersect: async () => { await gate.promise; return new Uint8Array([255, 0, 0, 0]); },
                releaseMask: () => released++
            };
            const selection = api.selection.byVolume('box', new Mat4(), 'replace', 1, { footprint: 0 });
            const undo = api.history.undo();
            gate.release();
            const result = await selection;
            await undo;
            assert.equal(result.matched, 1);
            assert.equal(layers[0].instances.numSelected, 0);
            assert.equal(layers[1].instances.numSelected, 0);
            assert.equal(history.canRedo(), true);
            assert.equal(released, 1);
        });
    },

    async 'cancellation after a GPU readback releases the mask and commits nothing'() {
        await quietly(() => use(async ({ call, scene, history }) => {
            const gate = barrier();
            const controller = new AbortController();
            let released = 0;
            scene.dataProcessor = {
                intersect: async () => { await gate.promise; return new Uint8Array([255, 255, 255, 0]); },
                releaseMask: () => released++
            };
            const pending = call('select_region', { layer: 0, shape: 'box', center: [0, 0, 0], size: [1, 1, 1] }, { signal: controller.signal });
            await tick();
            controller.abort();
            gate.release();
            const result = await pending;
            assert.equal(result.error.code, 'cancelled');
            assert.equal(released, 1);
            assert.equal(history.history.length, 0);
            assert.equal((await call('set_selection', { layer: 0, mode: 'all' })).affected, 3);
        }));
    },

    async 'preview excludes hidden splats and leaves selection and undo unchanged'() {
        await use(async ({ api, call, layers, history, scene }) => {
            await api.selection.all(0);
            await api.selection.hide(0);
            await api.history.undo();
            await api.selection.none(0);
            const before = history.cursor;
            let released = 0;
            scene.dataProcessor = {
                intersect: async () => new Uint8Array([255, 0, 0, 0]),
                calcMaskBound: async (_, mask) => {
                    assert.deepEqual(Array.from(mask.slice(0, 3)), [0, 255, 255]);
                    return new BoundingBox();
                },
                releaseMask: () => released++
            };
            const result = await call('select_region', { layer: 0, shape: 'sphere', center: [0, 0, 0], radius: 1, outside: true, preview: true });
            assert.equal(result.ok, true);
            assert.equal(result.matched, 2);
            assert.equal(result.affected, 0);
            assert.equal(layers[0].instances.numSelected, 0);
            assert.equal(history.cursor, before);
            assert.equal(released, 1);
            await api.selection.all(0);
            await api.selection.hide(0);
            const hidden = await call('select_region', { layer: 0, shape: 'sphere', center: [0, 0, 0], radius: 1, outside: true, preview: true });
            assert.equal(hidden.matched, 0);
        });
    },

    async 'explicit empty selection never grades the layer'() {
        await quietly(() => use(async ({ call, history }) => {
            const result = await call('apply_color', { layer: 0, scope: 'selection', brightness: 0.2 });
            assert.equal(result.error.code, 'empty_selection');
            assert.equal(history.history.length, 0);
            assert.equal((await call('delete_selection', { layer: 0 })).error.code, 'empty_selection');
        }));
    },

    async 'removed targets fail before execution and leave the queue usable'() {
        await quietly(() => use(async ({ api, queue, layers }) => {
            const gate = barrier();
            queue.enqueue(() => gate.promise);
            const pending = api.selection.all(0);
            layers[0].scene = null;
            gate.release();
            await assert.rejects(pending, error => error.code === 'layer_removed');
            assert.equal((await api.selection.all(1)).affected, 3);
        }));
    },

    async 'an aborted queued undo does not undo a completed edit'() {
        await quietly(() => use(async ({ api, queue, history }) => {
            await api.selection.all(0);
            const gate = barrier();
            queue.enqueue(() => gate.promise);
            const controller = new AbortController();
            const pending = api.history.undo({ signal: controller.signal });
            controller.abort();
            gate.release();
            await assert.rejects(pending, error => error.code === 'cancelled');
            assert.equal(history.cursor, 1);
        }));
    },

    async 'WebMCP retains structured failures and can execute the next request'() {
        await use(async ({ call }) => {
            const missing = await call('get_layer', { layer: 999 });
            assert.equal(missing.error.code, 'layer_not_found');
            const result = await call('set_selection', { layer: 0, mode: 'all' });
            assert.equal(result.ok, true);
            assert.equal(result.layers[0].id, 0);
            assert.deepEqual(result.layers[0].position, [0, 0, 0]);
            assert.equal(result.history.canUndo, true);
        });
    },

    async 'WebMCP registers the full tool set and disposal aborts every registration'() {
        await use(async ({ api }) => {
            const registered = [];
            const dispose = registerWebMCP(api, { registerTool: (tool, options) => registered.push({ tool, options }) });
            await tick();
            assert.equal(registered.length, 29);
            assert.equal(new Set(registered.map(r => r.tool.name)).size, 29);
            assert.equal(registered.find(r => r.tool.name === 'get_scene').tool.annotations.readOnlyHint, true);
            dispose();
            assert(registered.every(r => r.options.signal.aborted));
        });
    },

    async 'keyframes capture the camera or take explicit poses, as one undo step'() {
        await useTimeline(async ({ call, history, camera }) => {
            for (const keys of [[{ frame: 0, position: [0, 0, 1] }], [{ frame: 0 }, { frame: 0 }], [{ frame: 0, position: [1, 1, 1], target: [1, 1, 1] }], [{ frame: 180 }]]) {
                assert.equal((await call('set_keyframes', { keys })).error.code, 'invalid_input');
            }
            camera.position.set(1, 2, 3);
            const written = await call('set_keyframes', { keys: [{ frame: 0 }, { frame: 60, position: [0, 0, 5], target: [0, 1, 0], fov: 40 }] });
            assert.equal(written.affected, 2);
            assert.deepEqual(written.keys.map(k => [k.frame, k.position, k.fov]), [[0, [1, 2, 3], 60], [60, [0, 0, 5], 40]]);
            assert.equal(history.history.length, 1);
            const unchanged = await call('set_keyframes', { keys: [{ frame: 60, position: [0, 0, 5], target: [0, 1, 0], fov: 40 }] });
            assert.equal(unchanged.affected, 0);
            assert.equal(history.history.length, 1);
            assert.deepEqual(await frames(call), [0, 60]);
            // moving the playhead evaluates the camera path
            const at60 = await call('set_timeline', { frame: 60 });
            assert(close(at60.camera.position, [0, 0, 5]), JSON.stringify(at60.camera));
            assert.notEqual(at60.viewport.viewToken, written.viewport.viewToken);
            await call('undo');
            assert.deepEqual(await frames(call), []);
            await call('redo');
            assert.equal((await call('get_timeline')).keys[1].fov, 40);
        });
    },

    async 'set_timeline applies settings before the playhead and is not undoable'() {
        await useTimeline(async ({ call, history, camera }) => {
            await call('set_keyframes', { keys: [{ frame: 0, position: [0, 0, 4], target: [0, 0, 0], fov: 60 }, { frame: 100, position: [4, 0, 0], target: [0, 0, 0], fov: 40 }] });
            const mid = await call('set_timeline', { frame: 50, smoothness: 0, loop: false });
            assert.equal(mid.affected, 3);
            assert.equal(mid.rendered, true);
            assert(close(mid.camera.position, [2, 0, 2]), JSON.stringify(mid.camera));
            assert(Math.abs(camera.fov - 50) < 1e-6);
            for (const input of [{}, { frameRate: 25 }, { frame: 180 }, { frames: 0 }, { smoothness: 2 }, { frames: 40, frame: 40 }]) {
                assert.equal((await call('set_timeline', input)).error.code, 'invalid_input', JSON.stringify(input));
            }
            // shortening the timeline clamps the playhead and strands the later key
            const short = await call('set_timeline', { frames: 40, frameRate: 24 });
            assert.deepEqual([short.timeline.frame, short.timeline.outOfRangeKeys, short.timeline.duration], [39, 1, 40 / 24]);
            assert.equal((await call('get_timeline')).keys[1].inRange, false);
            assert.equal(history.history.length, 1);
        });
    },

    async 'move, copy and delete keyframes, each one undo step'() {
        await useTimeline(async ({ call, history }) => {
            await call('set_keyframes', { keys: [0, 30, 60].map(frame => ({ frame, position: [frame, 0, 1], target: [frame, 0, 0] })) });
            const moved = await call('move_keyframe', { from: 30, to: 60 });
            assert.equal(moved.replaced, true);
            assert.deepEqual(moved.keys[0].position, [30, 0, 1]);
            assert.deepEqual(await frames(call), [0, 60]);
            await call('undo');
            assert.deepEqual((await call('get_timeline')).keys.map(k => k.position[0]), [0, 30, 60]);
            const copied = await call('move_keyframe', { from: 0, to: 90, copy: true });
            assert.equal(copied.replaced, false);
            assert.deepEqual(await frames(call), [0, 30, 60, 90]);
            assert.equal((await call('move_keyframe', { from: 0, to: 180 })).error.code, 'invalid_input');
            assert.equal((await call('move_keyframe', { from: 45, to: 50 })).error.code, 'key_not_found');
            assert.equal((await call('delete_keyframes', { frames: [0, 45] })).error.code, 'key_not_found');
            assert.equal((await call('delete_keyframes', { frames: [0, 0] })).error.code, 'invalid_input');
            const cursor = history.cursor;
            const deleted = await call('delete_keyframes', { frames: [90, 0] });
            assert.deepEqual(deleted.deleted, [0, 90]);
            assert.equal(history.cursor, cursor + 1);
            assert.deepEqual(await frames(call), [30, 60]);
            await call('undo');
            assert.deepEqual(await frames(call), [0, 30, 60, 90]);
        });
    },

    async 'stranded keys move back into range and capture waits for a pause'() {
        await useTimeline(async ({ call }) => {
            await call('set_keyframes', { keys: [{ frame: 120, position: [0, 0, 1], target: [0, 0, 0] }] });
            await call('set_timeline', { frames: 60 });
            const back = await call('move_keyframe', { from: 120, to: 10 });
            assert.deepEqual([back.keys[0].inRange, back.timeline.outOfRangeKeys], [true, 0]);
            assert.equal((await call('set_timeline', { playing: true })).timeline.playing, true);
            assert.equal((await call('set_keyframes', { keys: [{ frame: 0 }] })).error.code, 'timeline_playing');
            assert.equal((await call('set_keyframes', { keys: [{ frame: 0, position: [1, 0, 0], target: [0, 0, 0], fov: 50 }] })).affected, 1);
            const moved = await call('set_timeline', { frame: 5 });
            assert.deepEqual([moved.timeline.frame, moved.timeline.playing], [5, true]);
            const paused = await call('set_timeline', { playing: false });
            assert.deepEqual([paused.affected, paused.timeline.playing], [1, false]);
        });
    }
};

export { checks as webmcpChecks };
