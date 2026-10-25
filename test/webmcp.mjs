import assert from 'node:assert/strict';
import { BoundingBox, Color, Mat4 } from 'playcanvas';

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
            assert.equal(registered.length, 24);
            assert.equal(new Set(registered.map(r => r.tool.name)).size, 24);
            assert.equal(registered.find(r => r.tool.name === 'get_scene').tool.annotations.readOnlyHint, true);
            dispose();
            assert(registered.every(r => r.options.signal.aborted));
        });
    }
};

export { checks as webmcpChecks };
