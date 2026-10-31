// Run after npm run build. Requires Chrome with WebMCP and WebGPU support.
// CHROME_PATH overrides the browser executable. Uses a disposable profile.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'supersplat-webmcp-'));
const downloads = path.join(temporary, 'downloads');
const enabled = !process.argv.includes('--without-webmcp');
await fs.mkdir(downloads);
const chromePath = process.env.CHROME_PATH ?? (process.platform === 'darwin' ?
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Two overlapping 9x9 grids, with known positions, colour and alpha.
const properties = ['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3'];
const rows = [];
for (const z of [-0.5, 0.5]) for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
    rows.push([x * 0.25, y * 0.25, z, x / 8, y / 8, z, 4, -2.5, -2.5, -2.5, 1, 0, 0, 0]);
}
const header = Buffer.from(`ply\nformat binary_little_endian 1.0\nelement vertex ${rows.length}\n${properties.map(p => `property float ${p}\n`).join('')}end_header\n`);
const body = Buffer.alloc(rows.length * properties.length * 4);
rows.flat().forEach((value, i) => body.writeFloatLE(value, i * 4));
const fixture = Buffer.concat([header, body]);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
const server = http.createServer(async (req, res) => {
    try {
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        if (['/fixture.ply', '/asset'].includes(pathname)) { res.end(fixture); return; }
        if (pathname === '/slow.ply') { await delay(300); res.end(fixture); return; }
        const base = pathname.startsWith('/downloads/') ? temporary : path.join(root, 'dist');
        const file = path.resolve(base, `.${pathname === '/' ? '/index.html' : pathname}`);
        if (!file.startsWith(`${base}${path.sep}`)) { res.writeHead(403).end(); return; }
        res.setHeader('Content-Type', types[path.extname(file)] ?? 'application/octet-stream');
        res.end(await fs.readFile(file));
    } catch { res.writeHead(404).end(); }
});

let chrome;
let ws;
try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}/`;
    chrome = spawn(chromePath, [`--user-data-dir=${path.join(temporary, 'profile')}`, '--remote-debugging-port=0',
        `--${enabled ? 'enable' : 'disable'}-blink-features=WebMCP,WebMCPTesting`, '--no-first-run', '--no-default-browser-check', '--disable-sync',
        '--disable-extensions', '--disable-background-networking', '--window-size=1100,800', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
    let chromeLog = '';
    chrome.stderr.on('data', chunk => { chromeLog += chunk; });
    let port;
    for (let i = 0; i < 100; i++) {
        try { port = (await fs.readFile(path.join(temporary, 'profile/DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await delay(100); }
    }
    assert.ok(port, `Chrome did not start: ${chromeLog}`);
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    let nextId = 0;
    const pending = new Map();
    const errors = [];
    ws.onmessage = ({ data }) => {
        const message = JSON.parse(data);
        if (message.id) {
            const task = pending.get(message.id);
            if (task) { pending.delete(message.id); message.error ? task.reject(message.error) : task.resolve(message.result); }
        } else if (message.method === 'Runtime.exceptionThrown') {
            errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
        } else if (message.method === 'Runtime.consoleAPICalled') {
            const text = message.params.args.map(arg => arg.value ?? arg.description ?? '').join(' ');
            if (message.params.type === 'error') errors.push(text);
            if (text.startsWith('PASS ') || text.startsWith('WebMCP')) console.log(text);
        }
    };
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
        const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout: 120000 });
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
        return result.result.value;
    };
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
    await send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await send('Page.navigate', { url });
    let ready;
    for (let i = 0; i < 200; i++) {
        ready = await evaluate('!!window.editor');
        if (ready) break;
        await delay(100);
    }
    assert.ok(ready, `Editor did not initialize: ${errors.join('\n')}`);
    const result = await evaluate(`(${browserChecks.toString()})(${JSON.stringify(url)}, ${enabled})`);
    if (enabled) {
        const rect = await evaluate(`(async () => {
            const layer = editor.layers.list()[0].id;
            editor.layers.setActive(layer);
            await editor.selection.none(layer);
            document.getElementById('bottom-toolbar-picker').click();
            return editor.viewport.info().rect;
        })()`);
        const start = { x: rect.x + rect.width * 0.35, y: rect.y + rect.height * 0.35 };
        const end = { x: rect.x + rect.width * 0.65, y: rect.y + rect.height * 0.65 };
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...start });
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...start, button: 'left', buttons: 1, clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...end, button: 'left', buttons: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...end, button: 'left', buttons: 0, clickCount: 1 });
        const selection = await evaluate('(async () => { await editor.inspect.scene(); return editor.layers.list()[0].selected; })()');
        assert.ok(selection > 0 && selection < 162, `UI rectangle selected ${selection}`);
        await evaluate('editor.history.undo()');
        assert.equal(await evaluate('editor.layers.list()[0].selected'), 0);
        result.checks += 2;
        console.log('PASS real pointer rectangle selection and shared undo');
    }
    console.log(JSON.stringify(result, null, 2));
    // Rejected commands (empty selection, hidden layer, cancellation) are
    // exercised above; their typed errors reach the caller without logging.
    assert.deepEqual(errors, [], 'Unexpected browser errors');
    if (process.env.WEBMCP_SCREENSHOT) {
        const { data } = await send('Page.captureScreenshot', { format: 'png' });
        await fs.writeFile(process.env.WEBMCP_SCREENSHOT, Buffer.from(data, 'base64'));
    }
    await send('Browser.close');
} finally {
    ws?.close();
    chrome?.kill();
    await new Promise(resolve => server.close(resolve));
    // Chrome may finish writing its profile after closing the debugging socket.
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

async function browserChecks(url, enabled) {
    const provider = document.modelContext ?? navigator.modelContext;
    if (!enabled) {
        if (provider) throw new Error('WebMCP should be disabled.');
        const imported = await window.editor.files.importUrl(`${url}fixture.ply`);
        await window.editor.selection.all(imported.createdLayer);
        await window.editor.history.undo();
        const layers = window.editor.layers.list();
        if (layers.length !== 1 || layers[0].total !== 162 || layers[0].selected !== 0) throw new Error('Editor without WebMCP failed.');
        return { checks: 1, result: 'Editor import, selection and undo work without WebMCP.' };
    }
    if (!provider) throw new Error('Native WebMCP is unavailable in this Chrome build.');
    const tools = await provider.getTools();
    let checks = 0;
    const check = (condition, name, detail) => {
        if (!condition) throw new Error(`${name}: ${JSON.stringify(detail)}`);
        checks++; console.log(`PASS ${name}`);
    };
    const used = new Set();
    const call = async (name, input = {}, expectedError) => {
        used.add(name);
        const raw = await provider.executeTool(tools.find(t => t.name === name), input);
        const result = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (expectedError) {
            check(!result.ok && result.error.code === expectedError, `${name} rejects ${expectedError}`, result);
        } else if (!result.ok) throw new Error(`${name}: ${JSON.stringify(result)}`);
        return result;
    };
    const near = (a, b) => Math.abs(a - b) < 0.001;
    check(tools.length === 29 && tools.every(t => t.title && !t.title.startsWith('webmcp.')), 'native discovery exposes 29 titled tools');
    const initial = await call('get_scene');
    check(initial.totalLayers === 0, 'empty scene inspection', initial);
    await call('set_selection', { layer: 99, mode: 'all' }, 'layer_not_found');
    const imported = await call('import_url', { url: `${url}fixture.ply` });
    const layer = imported.createdLayer;
    const info = async () => (await call('get_layer', { layer })).layer;
    check(imported.layers[0].total === 162 && imported.rendered, 'URL import attaches and renders 162 splats', imported);
    const original = await info();
    check(original.selected === 0 && original.shBands === 0, 'layer state and SH inspection', original);
    await call('undo');
    check((await call('get_scene')).totalLayers === 0, 'undo removes imported layer');
    await call('redo');
    check((await info()).total === 162, 'redo restores imported layer');
    const histogram = await call('get_histogram', { layer, property: 'x' });
    check(histogram.numValues === 162 && near(histogram.min, -1) && near(histogram.max, 1), 'GPU histogram reports known positions', histogram);
    const preview = await call('select_property', { layer, property: 'x', min: -0.01, max: 0.01, preview: true });
    check(preview.matched === 18 && preview.affected === 0 && near(preview.bounds.min[0], 0) && (await info()).selected === 0, 'property preview counts and bounds without editing', preview);
    const selected = await call('select_property', { layer, property: 'x', min: -0.01, max: 0.01 });
    check(selected.layers[0].selected === 18, 'inclusive property range selects exact values', selected);
    await call('hide_selection', { layer });
    check((await info()).hidden === 18 && (await info()).selected === 0, 'hide clears selected splats');
    const visibleHistogram = await call('get_histogram', { layer, property: 'x' });
    check(visibleHistogram.numValues === 144, 'histogram excludes hidden splats', visibleHistogram);
    await call('restore_splats', { layer, what: 'hidden' });
    check((await info()).hidden === 0 && (await info()).selected === 18, 'restore hidden preserves prior selection');
    await call('delete_selection', { layer });
    check((await info()).total === 144 && (await info()).deleted === 18, 'delete changes live and removed counts');
    await call('undo');
    check((await info()).total === 162 && (await info()).selected === 18, 'undo deletion restores exact selection');
    await call('redo');
    await call('restore_splats', { layer, what: 'deleted' });
    check((await info()).total === 162 && (await info()).deleted === 0, 'restore deleted source splats');
    await call('set_selection', { layer, mode: 'none' });
    await call('apply_color', { layer, scope: 'selection', brightness: 0.1 }, 'empty_selection');
    const region = { layer, shape: 'box', center: [0, 0, 0], size: [1.01, 1.01, 2], preview: true };
    const inside = await call('select_region', region);
    const outside = await call('select_region', { ...region, outside: true });
    check(inside.matched === 50 && outside.matched === 112, 'region preview and outside partition the scene', { inside, outside });
    await call('select_region', { ...region, preview: false, outside: true });
    await call('delete_selection', { layer });
    check((await info()).total === 50, 'crop workflow retains the box interior');
    await call('undo');
    check((await info()).total === 162, 'crop undo restores the layer');
    await call('select_property', { layer, property: 'x', min: -0.01, max: 0.01 });
    const duplicate = await call('duplicate_selection', { layer });
    check(duplicate.layers[1].total === 18 && (await info()).total === 162, 'duplicate creates an independent layer', duplicate);
    await call('undo');
    check((await call('get_scene')).totalLayers === 1, 'undo duplicate removes only the new layer');
    const separate = await call('separate_selection', { layer });
    check(separate.layers[0].total === 144 && separate.layers[1].total === 18, 'separate moves selected splats', separate);
    await call('undo');
    check((await info()).total === 162 && (await call('get_scene')).totalLayers === 1, 'separate is one undo step');
    await call('transform', { layer, scope: 'selection', translate: [2, 0, 0] });
    const moved = await call('get_histogram', { layer, property: 'x' });
    check(near(moved.max, 2), 'selection transform changes GPU positions', moved.max);
    await call('undo');
    check(near((await call('get_histogram', { layer, property: 'x' })).max, 1), 'undo selection transform restores positions');
    await call('transform', { layer, scope: 'layer', translate: [3, 0, 0], scale: 2 });
    const transformed = await call('get_histogram', { layer, property: 'x' });
    check(near(transformed.min, 1) && near(transformed.max, 5), 'layer transform applies world translation and scale', transformed);
    await call('undo');
    const opacityBefore = await call('get_histogram', { layer, property: 'opacity' });
    await call('apply_color', { layer, scope: 'layer', opacity: 0.5 });
    const opacityAfter = await call('get_histogram', { layer, property: 'opacity' });
    check(near(opacityAfter.max, opacityBefore.max / 2), 'layer colour applies to all splats despite a selection', { before: opacityBefore.max, after: opacityAfter.max });
    await call('reset_color', { layer, scope: 'layer' });
    check(near((await call('get_histogram', { layer, property: 'opacity' })).max, opacityBefore.max), 'reset colour restores source opacity');
    await call('undo');
    check(near((await call('get_histogram', { layer, property: 'opacity' })).max, opacityAfter.max), 'colour reset is undoable');
    await call('undo');
    await call('set_selection', { layer, mode: 'none' });
    await call('update_layer', { layer, name: 'WebMCP fixture', active: true });
    check((await info()).name === 'WebMCP fixture', 'rename updates layer state');
    await call('undo');
    check((await info()).name === 'fixture.ply', 'rename is undoable');
    await call('update_layer', { layer, visible: false });
    await call('set_selection', { layer, mode: 'all' }, 'layer_hidden');
    await call('update_layer', { layer, visible: true, active: true });
    await call('set_view', { showGrid: false, shBands: 0, background: [0.1, 0.2, 0.3], selectionColor: false });
    const display = (await call('get_scene')).view;
    check(display.showGrid === false && display.shBands === 0 && near(display.background[1], 0.2), 'display settings match editor preferences', display);
    const focused = await call('focus_camera', { scope: 'layer', layer });
    check(!!focused.viewport.viewToken, 'focus camera returns a view token');
    const camera = await call('set_camera', { position: [0, 0, 4], target: [0, 0, 0], fov: 60, orthographic: false });
    check(near(camera.camera.position[2], 4), 'camera uses requested world pose', camera);
    const token = camera.viewport.viewToken;
    const picked = await call('pick_points', { points: [{ x: 0.5, y: 0.5 }], layers: [layer], viewToken: token });
    // The depth picker returns composited Gaussian depth, not a centre ID.
    check(picked.hits[0]?.layer === layer && Math.abs(picked.hits[0].position[2] - 0.5) < 0.05, 'GPU depth picker finds the front grid', picked);
    for (const visibility of ['through', 'visible']) for (const footprint of [0, 1]) {
        await call('set_selection', { layer, mode: 'none' });
        const rectangle = await call('select_rectangle', { layer, visibility, footprint, start: { x: 0.35, y: 0.35 }, end: { x: 0.65, y: 0.65 }, viewToken: token });
        check(rectangle.layers[0].selected > 0 && rectangle.layers[0].selected < 162, `rectangle ${visibility}, footprint ${footprint}`, rectangle);
        await call('undo');
        check((await info()).selected === 0, `rectangle ${visibility}, footprint ${footprint} undo`);
    }
    const depthHistogram = await call('get_histogram', { layer, property: 'camera-depth' });
    check(depthHistogram.viewDependent && depthHistogram.viewToken === token, 'view-dependent histogram supplies its view token', depthHistogram);
    await call('select_property', { layer, property: 'camera-depth', min: 0, max: 10 }, 'invalid_input');
    await call('select_property', { layer, property: 'camera-depth', min: 0, max: 10, viewToken: token });
    check((await info()).selected === 162, 'camera-dependent range accepts the current view');
    await call('set_camera', { azimuth: 45 });
    await call('select_rectangle', { layer, visibility: 'through', start: { x: 0, y: 0 }, end: { x: 1, y: 1 }, viewToken: token }, 'stale_view');
    await call('pick_points', { points: [{ x: 0.5, y: 0.5 }], viewToken: token }, 'stale_view');
    await call('set_camera', { position: [0, 0, 4], target: [0, 0, 0] });
    await call('select_property', { layer, property: 'x', min: -0.01, max: 0.01 });
    const exported = await call('export_scene', { format: 'ply', filename: 'selection.ply', scope: 'selection', layer });
    check(exported.splats === 18 && exported.status === 'download_requested', 'selection export reports a download request', exported);
    // Wait for Chrome's download writer, not just the tool's request.
    let downloaded = false;
    for (let i = 0; i < 100; i++) {
        if ((await fetch(`${url}downloads/selection.ply`)).ok) { downloaded = true; break; }
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    check(downloaded, 'browser completes the requested download');
    const roundtrip = await call('import_url', { url: `${url}downloads/selection.ply` });
    check(roundtrip.layers[0].total === 18, 'exported selection reimports with the exact count', roundtrip);
    const page = await call('get_scene', { offset: 0, limit: 1 });
    check(page.totalLayers === 2 && page.layers.length === 1 && page.nextOffset === 1, 'scene inspection paginates layers');
    await call('undo');
    const waitDownload = async filename => {
        for (let i = 0; i < 100; i++) {
            const response = await fetch(`${url}downloads/${filename}`);
            if (response.ok) return response.arrayBuffer();
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        throw new Error(`Download missing: ${filename}`);
    };
    for (const [format, filename] of [['compressed-ply', 'compressed.ply'], ['splat', 'test.splat'], ['spz', 'test.spz'], ['sog', 'test.sog'], ['viewer-html', 'test.html'], ['viewer-zip', 'test.zip']]) {
        await call('export_scene', { format, filename, scope: 'layer', layer, ...(format === 'sog' ? { sogIterations: 1 } : {}) });
        const bytes = await waitDownload(filename);
        check(bytes.byteLength > 0, `${format} download contains data`);
        if (!format.startsWith('viewer-')) {
            const restored = await call('import_url', { url: `${url}downloads/${filename}` });
            check(restored.layers[0].total === 162, `${format} export reimports with exact count`, restored);
            await call('undo');
        }
    }
    const signed = await call('import_url', { url: `${url}asset?signature=fixture`, filename: 'named.ply' });
    check(signed.layers[0].total === 162 && signed.layers[0].name === 'named.ply', 'extensionless URL uses explicit filename');
    await call('undo');
    await call('import_url', { url: `${url}missing.ply` }, 'operation_failed');
    check(document.getElementById('popup').classList.contains('pcui-hidden'), 'failed import returns an error without opening a modal');
    const controller = new AbortController();
    const cancelled = provider.executeTool(tools.find(t => t.name === 'import_url'), { url: `${url}slow.ply` }, { signal: controller.signal }).catch(error => ({ error: error.name }));
    setTimeout(() => controller.abort(), 50);
    await cancelled;
    // Native cancellation may settle before the callback has finished loading.
    await call('get_scene');
    check((await call('get_scene')).totalLayers === 1, 'cancelled native import does not attach a layer');
    await call('set_timeline', { frames: 300, frameRate: 30, loop: false });
    await call('set_camera_keyframe', { frame: 0, position: [0, 0, 6], target: [0, 0, 0], fov: 60 });
    await call('set_camera_keyframe', { frame: 299, position: [3, 2, 6], target: [0, 0, 0], fov: 70 });
    const timeline = await call('get_timeline');
    check(timeline.timeline.duration === 10 && timeline.keyframes.length === 2, 'native timeline authors a ten-second camera path', timeline);
    await call('set_timeline', { frame: 299 });
    const endCamera = (await call('get_scene')).camera;
    check(near(endCamera.position[0], 3) && near(endCamera.fov, 70), 'native timeline seek evaluates camera and FOV', endCamera);
    await call('move_camera_keyframe', { fromFrame: 0, toFrame: 100, copy: true });
    await call('remove_camera_keyframe', { frame: 100 });
    await call('undo');
    check((await call('get_timeline')).timeline.keyframeCount === 3, 'native keyframe edits share undo history');
    await call('set_timeline', { frame: 0 });
    const language = document.querySelector('#settings-panel .settings-panel-row-select').ui;
    language.value = 'fr';
    let localized;
    for (let i = 0; i < 100; i++) {
        localized = await provider.getTools();
        if (localized.length === 29 && localized.find(t => t.name === 'get_scene').title !== tools.find(t => t.name === 'get_scene').title) break;
        await new Promise(resolve => setTimeout(resolve, 20));
    }
    check(localized.length === 29 && new Set(localized.map(t => t.name)).size === 29 && localized.find(t => t.name === 'get_scene').title !== tools.find(t => t.name === 'get_scene').title, 'live language change replaces tool titles without duplicates');
    const localizedScene = JSON.parse(await provider.executeTool(localized.find(t => t.name === 'get_scene'), {}));
    check(localizedScene.ok && localizedScene.totalLayers === 1, 'localized native tools retain the scene');
    language.value = 'en';
    check(used.size === 29, 'all 29 native tools were executed', [...used]);
    return { checks, used: [...used] };
}
