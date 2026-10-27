// Loads the built editor in an iframe, as the lookleft app embeds it, and fails on an uncaught
// error, a missing ready message or a missing fork panel.
// usage: node smoke.mjs <dist directory>
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const dist = process.argv[2];
if (!dist) {
    console.error('usage: node smoke.mjs <dist directory>');
    process.exit(2);
}

const types = {
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml',
    '.webp': 'image/webp', '.woff2': 'font/woff2'
};

const host = `<!doctype html><html><body style="margin:0">
<iframe id="editor" src="/index.html" style="width:1280px;height:800px;border:0"></iframe>
<script>
window.received = [];
window.addEventListener('message', e => window.received.push(e.data && e.data.type));
</script></body></html>`;

const server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path === '/__host.html') {
        response.writeHead(200, { 'content-type': 'text/html' }).end(host);
        return;
    }
    const file = normalize(join(dist, path === '/' ? 'index.html' : path));
    if (!file.startsWith(normalize(dist))) {
        response.writeHead(403).end();
        return;
    }
    try {
        const body = await readFile(file);
        response.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' }).end(body);
    } catch {
        response.writeHead(404).end();
    }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

const failures = [];
// SuperSplat 3 needs WebGPU; a runner has no GPU, so Chromium is pointed at its software adapter.
const browser = await chromium.launch({
    args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', error => failures.push(`uncaught: ${error.message}`));
    page.on('console', message => {
        if (message.type() === 'error' && message.text().includes('[IframeIntegration]')) failures.push(`console: ${message.text()}`);
    });

    await page.goto(`${origin}/__host.html`);
    try {
        await page.waitForFunction(
            () => window.received.includes('splat-editor-ready') && window.received.includes('supersplat:ready'),
            null,
            { timeout: 90_000 }
        );
    } catch {
        failures.push(`no ready message within 90 s; received: ${JSON.stringify(await page.evaluate(() => window.received))}`);
    }

    const frame = page.frameLocator('#editor');
    for (const selector of ['.render-sub-tabs', '.reveal-effect-select', '.views-create-button', '.annotations-create-button']) {
        if (await frame.locator(selector).count() === 0) failures.push(`missing fork element ${selector}`);
    }

    await page.evaluate(() => {
        const target = document.getElementById('editor').contentWindow;
        target.postMessage({ type: 'supersplat:load-views', views: [] }, '*');
        target.postMessage({ type: 'supersplat:load-annotations', annotations: [] }, '*');
    });
    await page.waitForTimeout(3_000);
} finally {
    await browser.close();
    server.close();
}

if (failures.length > 0) {
    console.error(`Smoke test failed:\n${failures.map(f => `- ${f}`).join('\n')}`);
    process.exit(1);
}
console.log('Smoke test passed: the editor loaded in an iframe, announced itself and shows the fork panels.');
