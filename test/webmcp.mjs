import assert from 'node:assert/strict';
import { BoundingBox, Color, Mat4, Quat, Vec3 } from 'playcanvas';

import { SH_C0 } from './.build/src/color-grade.js';
import { samplePrimitives, toColumns } from './.build/src/generate-splats.js';
import { histogramStats, mergeBins } from './.build/src/histogram-stats.js';
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
            assert.equal(registered.length, 28);
            assert.equal(new Set(registered.map(r => r.tool.name)).size, 28);
            assert.equal(registered.find(r => r.tool.name === 'get_scene').tool.annotations.readOnlyHint, true);
            dispose();
            assert(registered.every(r => r.options.signal.aborted));
        });
    },

    async 'created data uses the 3DGS column convention in world space'() {
        const s = Math.SQRT1_2;
        const columns = toColumns({
            positions: new Float32Array([1, 2, 3, -1, 0, 0]),
            scales: new Float32Array([0.1, 0.2, 0.3, 1, 1, 1]),
            rotations: new Float32Array([0, s, 0, s, 0, 0, 0, 1]),
            colors: new Float32Array([1, 0, 0.5, 0, 1, 0]),
            opacities: new Float32Array([0.25, 1])
        });
        const col = Object.fromEntries(columns.map(c => [c.name, c.data]));
        const row = i => Object.fromEntries(Object.entries(col).map(([k, v]) => [k, v[i]]));
        const near = (a, b) => a.forEach((v, i) => assert(Math.abs(v - b[i]) < 1e-5, `${a} != ${b}`));
        const first = row(0);
        near([first.x, first.y, first.z], [1, 2, 3]);
        near([first.f_dc_0, first.f_dc_1, first.f_dc_2].map(v => v * SH_C0 + 0.5), [1, 0, 0.5]);
        near([1 / (1 + Math.exp(-first.opacity))], [0.25]);
        near([first.scale_0, first.scale_1, first.scale_2].map(Math.exp), [0.1, 0.2, 0.3]);
        // rot_0 is w; 90 degrees about Y takes +X to -Z
        const x = new Quat(first.rot_1, first.rot_2, first.rot_3, first.rot_0).transformVector(Vec3.RIGHT);
        near([x.x, x.y, x.z], [0, 0, -1]);
        near([row(1).rot_0, row(1).opacity > 10 ? 1 : 0], [1, 1]);
    },

    async 'creation tools reject invalid input before creating anything'() {
        await use(async ({ call, api, history }) => {
            let created = 0;
            api.create.primitives = api.create.generator = api.layers.instance = () => { created++; return {}; };
            const box = { shape: 'box', center: [0, 0, 0], size: [1, 1, 1] };
            for (const [name, input] of [
                ['create_primitives', { parts: [] }],
                ['create_primitives', { parts: [{ ...box, shape: 'plane', fill: 'volume' }] }],
                ['create_primitives', { parts: [{ ...box, size: [1, 0, 1] }] }],
                ['create_primitives', { parts: [{ ...box, shape: 'torus' }] }],
                ['create_primitives', { parts: [{ ...box, count: 0 }] }],
                ['create_primitives', { parts: [{ ...box, count: 1000000 }, { ...box, count: 1000000 }, { ...box, count: 1 }] }],
                ['create_primitives', box],
                ['create_from_generator', {}],
                ['create_from_generator', { source: ' ' }],
                ['create_from_generator', { source: 'x', params: [{ name: 'n' }] }],
                ['create_from_generator', { source: 'x', params: [{ name: 'n', value: 3 }] }],
                ['instance_layer', { layer: 0, copies: [] }],
                ['instance_layer', { layer: 0, copies: [{ scale: 0 }] }],
                ['instance_layer', { layer: 0, copies: new Array(129).fill({}) }],
                ['instance_layer', { layer: 0, copies: [{ translate: [1, 2] }] }]
            ]) {
                const result = await call(name, input);
                assert.equal(result.error?.code, 'invalid_input', `${name} ${JSON.stringify(input).slice(0, 80)}`);
            }
            assert.equal(created, 0);
            assert.equal(history.history.length, 0);
        });
    },

    async 'creation tools pass world-space arguments to the editor API'() {
        await use(async ({ call, api }) => {
            const calls = [];
            api.create.primitives = (...args) => { calls.push(['primitives', ...args]); return {}; };
            api.create.generator = (...args) => { calls.push(['generator', ...args]); return {}; };
            api.layers.instance = (...args) => { calls.push(['instance', ...args]); return {}; };
            assert.equal((await call('create_primitives', { name: 'tree', parts: [
                { shape: 'cylinder', center: [0, 0.35, 0], size: [0.1, 0.7, 0.1], count: 10 },
                { shape: 'cone', center: [0, 1, 0], size: [1, 1, 1], rotate: [0, 90, 0], fill: 'volume', color: [0, 1, 0], opacity: 0.5, splatSize: 0.02 }
            ] })).ok, true);
            const [, parts, name] = calls[0];
            assert.equal(name, 'tree');
            assert.equal(parts[0].count, 10);
            assert.equal(parts[0].fill, 'surface');
            assert.deepEqual(parts[0].color, [1, 1, 1]);
            assert.equal(parts[1].count, 20000);
            assert(parts[1].rotation.equals(new Quat().setFromEulerAngles(0, 90, 0)));
            assert.deepEqual([parts[1].center.y, parts[1].fill, parts[1].opacity, parts[1].splatSize], [1, 'volume', 0.5, 0.02]);

            await call('create_from_generator', { source: 'export class Generator {}', params: [{ name: 'n', value: '5' }] });
            assert.deepEqual(calls[1].slice(0, 4), ['generator', 'export class Generator {}', [{ name: 'n', value: '5' }], undefined]);

            await call('instance_layer', { layer: 1, copies: [{ translate: [1, 0, 0] }, { rotate: [0, 45, 0], scale: 2, center: [0, 0, 0] }], name: 'tree' });
            const [, layer, copies, prefix] = calls[2];
            assert.deepEqual([layer, prefix, copies.length], [1, 'tree', 2]);
            assert.equal(copies[0].translate.x, 1);
            assert.equal(copies[0].rotate, undefined);
            assert(copies[1].rotate.equals(new Quat().setFromEulerAngles(0, 45, 0)));
            assert.deepEqual([copies[1].scale, copies[1].center.x], [2, 0]);
        });
    },

    async 'multi-part primitives concatenate their parts in order'() {
        const base = { center: new Vec3(), size: new Vec3(1, 1, 1), rotation: new Quat(), fill: 'surface', color: [1, 0, 0], opacity: 1 };
        const data = samplePrimitives([{ ...base, shape: 'sphere', count: 100 }, { ...base, shape: 'box', count: 50, color: [0, 0, 1], center: new Vec3(5, 0, 0) }]);
        assert.equal(data.opacities.length, 150);
        assert.deepEqual(Array.from(data.colors.subarray(0, 3)), [1, 0, 0]);
        assert.deepEqual(Array.from(data.colors.subarray(100 * 3, 100 * 3 + 3)), [0, 0, 1]);
        assert(data.positions[100 * 3] > 4);
    },

    async 'histogram stats interpolate percentiles within bins'() {
        // 100 values spread evenly over [0, 10): one per 0.1
        const counts = new Array(10).fill(10);
        const stats = histogramStats(counts, 0, 10);
        assert.equal(stats.count, 100);
        assert(Math.abs(stats.mean - 5) < 1e-9);
        assert(Math.abs(stats.percentiles.p50 - 5) < 1e-9);
        assert(Math.abs(stats.percentiles.p5 - 0.5) < 1e-9);
        assert(Math.abs(stats.percentiles.p99 - 9.9) < 1e-9);
        // a single populated bin bounds every percentile to that bin
        const spike = histogramStats([0, 0, 40, 0], 0, 4);
        assert(Object.values(spike.percentiles).every(p => p >= 2 && p <= 3));
        assert.equal(histogramStats([0, 0], 0, 1), null);
        assert.deepEqual(mergeBins([1, 2, 3, 4, 5, 6, 7, 8], 2), [10, 26]);
    },

    async 'histogram and render tools validate and map their arguments'() {
        await use(async ({ call, api }) => {
            const calls = [];
            api.inspect.histogram = (...args) => { calls.push(['histogram', ...args]); return {}; };
            api.viewport.render = (...args) => { calls.push(['render', ...args]); return {}; };
            for (const [name, input] of [
                ['get_histogram', { layer: 0, property: 'opacity', bins: 24 }],
                ['get_histogram', { layer: 0, property: 'opacity', bins: '16' }],
                ['get_histogram', { layer: 0, property: 'opacity', bins: 512 }],
                ['get_histogram', { layer: 0, property: 'opacity', range: [0] }],
                ['render_view', { width: 8 }],
                ['render_view', { format: 'gif' }],
                ['render_view', { quality: 0 }]
            ]) {
                assert.equal((await call(name, input)).error?.code, 'invalid_input', `${name} ${JSON.stringify(input)}`);
            }
            assert.equal(calls.length, 0);
            await call('get_histogram', { layer: 0, property: 'opacity', bins: 16, range: [0, 0.1] });
            assert.deepEqual([calls[0][1], calls[0][2], calls[0][3].bins, calls[0][3].range], [0, 'opacity', 16, [0, 0.1]]);
            await call('render_view', { position: [0, 1, 5], target: [0, 1, 0], width: 320, format: 'png' });
            const [, settings] = calls[1];
            assert.deepEqual([settings.position.z, settings.target.y, settings.width, settings.format], [5, 1, 320, 'png']);
        });
    },

    async 'primitives sample exact counts on their surface or within their volume'() {
        const rotation = new Quat().setFromEulerAngles(30, 45, 60);
        const inverse = rotation.clone().invert();
        const center = new Vec3(1, -2, 3);
        const size = new Vec3(2, 3, 4);
        const local = (data, i) => {
            const p = new Vec3(data.positions[i * 3], data.positions[i * 3 + 1], data.positions[i * 3 + 2]).sub(center);
            inverse.transformVector(p, p);
            return new Vec3(p.x / size.x, p.y / size.y, p.z / size.z);
        };
        const N = 20001; // leaves a remainder for every multi-part surface
        const spec = { center, size, rotation, count: N, color: [1, 1, 1], opacity: 1 };
        for (const shape of ['sphere', 'box', 'plane', 'cylinder', 'cone']) {
            for (const fill of shape === 'plane' ? ['surface'] : ['surface', 'volume']) {
                const data = samplePrimitives([{ ...spec, shape, fill }]);
                assert.equal(data.opacities.length, N);
                assert(data.scales.every(v => Number.isFinite(v) && v > 0), `${shape} ${fill} scales`);
                const mean = new Vec3();
                for (let i = 0; i < N; i++) {
                    const p = local(data, i);
                    mean.add(p);
                    const r = Math.hypot(p.x, p.z);
                    const inside = {
                        sphere: p.length() <= 0.5 + 1e-4,
                        box: Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)) <= 0.5 + 1e-4,
                        plane: Math.abs(p.y) < 1e-4 && Math.max(Math.abs(p.x), Math.abs(p.z)) <= 0.5 + 1e-4,
                        cylinder: r <= 0.5 + 1e-4 && Math.abs(p.y) <= 0.5 + 1e-4,
                        cone: Math.abs(p.y) <= 0.5 + 1e-4 && r <= (0.5 - p.y) / 2 + 1e-4
                    }[shape];
                    assert(inside, `${shape} ${fill} sample ${i} outside: ${p}`);
                    if (fill === 'surface') {
                        const onSurface = {
                            sphere: Math.abs(p.length() - 0.5) < 1e-4,
                            box: Math.abs(Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)) - 0.5) < 1e-4,
                            plane: true,
                            cylinder: Math.abs(r - 0.5) < 1e-4 || Math.abs(Math.abs(p.y) - 0.5) < 1e-4,
                            cone: Math.abs(r - (0.5 - p.y) / 2) < 1e-4 || Math.abs(p.y + 0.5) < 1e-4
                        }[shape];
                        assert(onSurface, `${shape} sample ${i} off surface: ${p}`);
                    }
                }
                mean.mulScalar(1 / N);
                // even coverage: the centroid of symmetric shapes stays near the centre
                if (shape !== 'cone') assert(mean.length() < 0.02, `${shape} ${fill} centroid ${mean}`);
            }
        }

        // surface splats are flat and their thin axis faces outward
        const sphere = samplePrimitives([{ ...spec, shape: 'sphere', fill: 'surface', size: new Vec3(2, 2, 2) }]);
        for (let i = 0; i < N; i++) {
            const q = new Quat(...sphere.rotations.subarray(i * 4, i * 4 + 4));
            const normal = q.transformVector(Vec3.BACK);
            const radial = new Vec3(...sphere.positions.subarray(i * 3, i * 3 + 3)).sub(center).normalize();
            assert(normal.dot(radial) > 0.999, `sphere normal ${i}`);
            assert(sphere.scales[i * 3 + 2] < sphere.scales[i * 3]);
        }
        assert.deepEqual(samplePrimitives([{ ...spec, shape: 'box', fill: 'volume' }]).positions,
            samplePrimitives([{ ...spec, shape: 'box', fill: 'volume' }]).positions);
    }
};

export { checks as webmcpChecks };
