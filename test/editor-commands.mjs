import assert from 'node:assert/strict';

import { BoundingBox, Entity, Mat4, NullGraphicsDevice, PIXELFORMAT_RGBA8, PIXELFORMAT_RGBA16F, RenderTarget, Texture, Vec3 } from 'playcanvas';

import { Camera } from './.build/src/camera.js';
import { CommandQueue } from './.build/src/command-queue.js';
import { EditHistory } from './.build/src/edit-history.js';
import { createEditorAPI } from './.build/src/editor-api.js';
import { Events } from './.build/src/events.js';
import { GaussianInstances } from './.build/src/gaussian-instances.js';
import { Picker } from './.build/src/picker.js';

const setup = () => {
    const events = new Events();
    const queue = new CommandQueue();
    const history = new EditHistory(events, queue);
    // Use the real instance mutators; only the GPU uploads are inert.
    const device = {
        buffers: new Set(),
        _vram: { sb: 0 },
        createBufferImpl: () => ({ allocate() {}, write() {}, destroy() {} })
    };
    const layers = [];
    const scene = { getElementsByType: () => layers };
    for (let uid = 0; uid < 2; uid++) {
        layers.push({
            uid, scene, visible: true, name: `layer-${uid}`,
            resource: { numRows: 3, shBands: 0 },
            entity: new Entity(), worldBound: new BoundingBox(), selectionBound: new BoundingBox(), worldTransform: new Mat4(),
            instances: new GaussianInstances(device, 3),
            async updateState() {
                this.instances.flush();
                events.fire('splat.stateChanged', this);
            }
        });
    }
    events.function('selection', () => layers[0]);
    const api = createEditorAPI(events, scene, history, queue);
    return { api, layers, scene, queue, history, events };
};

const checks = {
    async 'queued depth picks snapshot point values, array membership and explicit targets'() {
        const queue = new CommandQueue();
        const frame = {};
        const target = {};
        const points = [{ x: 0.25, y: 0.75 }];
        const targets = [target];
        const camera = {
            scene: { commandQueue: queue },
            captureFrame: () => frame,
            pickDepths: async (ctx, captured, points, targets) => ({ captured, points, targets })
        };
        const pending = Camera.prototype.intersectMany.call(camera, points, targets);
        points[0].x = 1;
        points[0].y = 0;
        points.length = 0;
        targets.length = 0;
        const result = await pending;
        assert.equal(result.captured, frame);
        assert.deepEqual(result.points, [{ x: 0.25, y: 0.75 }]);
        assert.deepEqual(result.targets, [target]);
    },

    async 'hide, unhide, delete and restore notify selection through undo and redo'() {
        const { api, layers } = setup();
        const notices = [];
        api.on('selectionChanged', ({ layer }) => notices.push(['selection', layer, layers[layer].instances.numSelected]));
        api.on('documentChanged', () => notices.push(['document']));
        const check = async (command, selected, document = true) => {
            notices.length = 0;
            await command();
            assert.deepEqual(notices, [
                ['selection', 0, selected],
                ...(document ? [['document']] : [])
            ]);
        };
        try {
            await check(() => api.selection.all(), 3, false);
            await check(() => api.selection.hide(), 0);
            await check(() => api.history.undo(), 3);
            await check(() => api.history.redo(), 0);
            await check(() => api.selection.unhide(), 3);
            await check(() => api.history.undo(), 0);
            await check(() => api.history.redo(), 3);
            await check(() => api.selection.delete(), 0);
            await check(() => api.history.undo(), 3);
            await check(() => api.history.redo(), 0);
            await check(() => api.selection.restoreDeleted(), 0);
            await check(() => api.history.undo(), 0);
            await check(() => api.history.redo(), 0);
            notices.length = 0;
            await api.layers.rename(0, 'renamed');
            assert.deepEqual(notices, [['document']]);
        } finally {
            layers.forEach(layer => layer.instances.destroy());
        }
    },

    async 'multi-layer unhide reports each affected layer, including undo'() {
        const { api, layers } = setup();
        try {
            for (const layer of layers) {
                await api.selection.all(layer.uid);
                await api.selection.hide(layer.uid);
            }
            const notices = [];
            api.on('selectionChanged', ({ layer }) => notices.push(layer));
            await api.selection.unhide();
            assert.deepEqual(notices, [0, 1]);
            notices.length = 0;
            await api.history.undo();
            assert.deepEqual(notices, [0, 1]);
        } finally {
            layers.forEach(layer => layer.instances.destroy());
        }
    },

    // fire-and-forget UI callers only attach .catch, so a command must never
    // throw at its call site
    async 'invalid commands reject instead of throwing and leave history unchanged'() {
        const { api, layers, history } = setup();
        const grade = { tintClr: { r: 1, g: 1, b: 1 }, temperature: 0, saturation: 1, brightness: 0, blackPoint: 0.5, whitePoint: 0.5, transparency: 1 };
        const commands = [
            ['invalid_input', () => api.color.apply(grade, 0)],
            ['invalid_input', () => api.transform(0, 'layer', { scale: -1 })],
            ['invalid_input', () => api.viewport.setCamera({ position: new Vec3() })],
            ['layer_not_found', () => api.selection.all(99)],
            ['layer_not_found', () => api.layers.rename(99, 'name')],
            ['cancelled', () => api.selection.delete(0, { signal: AbortSignal.abort() })]
        ];
        try {
            for (const [code, command] of commands) {
                const pending = command();
                await assert.rejects(pending, error => error.code === code);
            }
            assert.equal(history.history.length, 0);
        } finally {
            layers.forEach(layer => layer.instances.destroy());
        }
    },

    async 'resized picks retain temporary buffers through readback and release them on success or failure'() {
        const device = new NullGraphicsDevice();
        const createTarget = format => new RenderTarget({
            colorBuffer: new Texture(device, { width: 64, height: 32, format, mipmaps: false }),
            depth: false
        });
        const idTarget = createTarget(PIXELFORMAT_RGBA8);
        const depthTarget = createTarget(PIXELFORMAT_RGBA16F);
        const picker = new Picker({ graphicsDevice: device, app: { renderer: {} } });
        picker.setRenderTargets(depthTarget, idTarget);
        try {
            for (const kind of ['id', 'depth']) {
                const key = `${kind}RenderTarget`;
                const live = picker[key];
                await picker.withTargetSize(kind, { width: 64, height: 32 }, async () => {
                    assert.equal(picker[key], live);
                });
                for (const fail of [false, true]) {
                    let release;
                    const readback = new Promise(resolve => release = resolve);
                    const pending = picker.withTargetSize(kind, { width: 128, height: 96 }, async () => {
                        assert.notEqual(picker[key], live);
                        assert.equal(picker[key].width, 128);
                        assert.equal(picker[key].height, 96);
                        assert.equal(picker[key].colorBuffer.format, live.colorBuffer.format);
                        await readback;
                        if (fail) throw new Error('readback failed');
                        return 42;
                    });
                    const temporaryBuffer = picker[key].colorBuffer;
                    assert.equal(temporaryBuffer.device, device);
                    release();
                    if (fail) await assert.rejects(pending, /readback failed/);
                    else assert.equal(await pending, 42);
                    assert.equal(picker[key], live);
                    assert.equal(temporaryBuffer.device, null);
                    assert.equal(live.colorBuffer.device, device);
                    assert.equal(live.width, 64);
                    assert.equal(live.height, 32);
                }
            }
        } finally {
            picker.destroy();
            for (const target of [idTarget, depthTarget]) {
                target.destroyTextureBuffers();
                target.destroy();
            }
            device.destroy();
        }
    }
};

export { checks as editorCommandChecks, setup };
