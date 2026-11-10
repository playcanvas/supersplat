import type { CommandOptions } from './editor-command';
import { checkCancelled, EditorError } from './editor-command';

// splat-transform passes generator parameters as name/value strings.
type GeneratorParam = { name: string; value: string };

// One named column of gaussian data, in the 3DGS PLY convention.
type GaussianColumn = { name: string; data: Float32Array };

const MAX_COUNT = 2_000_000;
const MAX_COLUMNS = 64;
const TIMEOUT_MS = 10_000;

// Runs in a classic worker (module workers cannot start in an opaque origin)
// that loads the generator with dynamic import. Same contract as splat-transform's .mjs generators:
// the module exports a Generator class whose static create(params) returns
// { count, columnNames, getRow(index, row) }.
const WORKER = `
self.onmessage = async ({ data }) => {
    try {
        const module = await import(URL.createObjectURL(new Blob([data.source], { type: 'text/javascript' })));
        const generator = await module.Generator?.create?.(data.params);
        if (!generator) throw new Error('The module must export a Generator class with a static create(params) method.');
        const { count, columnNames } = generator;
        if (!Number.isInteger(count) || count < 1 || count > data.maxCount) throw new Error('count must be an integer from 1 to ' + data.maxCount + '.');
        if (!Array.isArray(columnNames) || !columnNames.length || columnNames.length > data.maxColumns || columnNames.some(n => typeof n !== 'string')) {
            throw new Error('columnNames must be 1 to ' + data.maxColumns + ' strings.');
        }
        const columns = columnNames.map(() => new Float32Array(count));
        const row = {};
        for (let i = 0; i < count; i++) {
            generator.getRow(i, row);
            for (let c = 0; c < columns.length; c++) columns[c][i] = row[columnNames[c]];
        }
        self.postMessage({ ok: true, columnNames, columns }, columns.map(c => c.buffer));
    } catch (error) {
        self.postMessage({ ok: false, message: String(error?.message ?? error) });
    }
};`;

// The iframe is sandboxed without allow-same-origin, so the generator runs in
// an opaque origin: no access to the editor's DOM, storage or file handles.
// The CSP blocks network access; the worker keeps long loops off the page.
const FRAME = `<!DOCTYPE html><html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:">
</head><body><script>
addEventListener('message', (event) => {
    if (event.source !== parent) return;
    const worker = new Worker(URL.createObjectURL(new Blob([${JSON.stringify(WORKER)}], { type: 'text/javascript' })));
    worker.onmessage = e => parent.postMessage(e.data, '*', e.data.ok ? e.data.columns.map(c => c.buffer) : []);
    worker.onerror = (e) => {
        e.preventDefault();
        parent.postMessage({ ok: false, message: e.message || 'The generator module failed to load.' }, '*');
    };
    worker.postMessage(event.data);
});
parent.postMessage({ ready: true }, '*');
</script></body></html>`;

const runGenerator = (
    source: string,
    params: GeneratorParam[],
    options?: CommandOptions
): Promise<GaussianColumn[]> => {
    checkCancelled(options);
    return new Promise((resolve, reject) => {
        const frame = document.createElement('iframe');
        frame.setAttribute('sandbox', 'allow-scripts');
        frame.style.display = 'none';
        // aborting `done` removes every listener and the timer
        const done = new AbortController();
        const finish = (error: Error | null, columns?: GaussianColumn[]) => {
            if (done.signal.aborted) return;
            done.abort();
            frame.remove();
            if (error) reject(error);
            else resolve(columns);
        };
        window.addEventListener(
            'message',
            (event: MessageEvent) => {
                if (event.source !== frame.contentWindow) return;
                const data = event.data;
                if (data?.ready) {
                    frame.contentWindow.postMessage(
                        { source, params, maxCount: MAX_COUNT, maxColumns: MAX_COLUMNS },
                        '*'
                    );
                    return;
                }
                if (!data?.ok) {
                    finish(new EditorError('generator_failed', String(data?.message ?? 'The generator failed.')));
                    return;
                }
                // the sandbox runs untrusted code, so check its reply too
                const { columnNames, columns } = data;
                const count = columns?.[0]?.length;
                if (
                    !Array.isArray(columnNames) ||
                    !columnNames.every((n: unknown) => typeof n === 'string') ||
                    new Set(columnNames).size !== columnNames.length
                ) {
                    finish(new EditorError('generator_failed', 'columnNames must be unique strings.'));
                } else if (
                    !Array.isArray(columns) ||
                    columns.length !== columnNames.length ||
                    !(count > 0 && count <= MAX_COUNT) ||
                    !columns.every((c: unknown) => c instanceof Float32Array && c.length === count)
                ) {
                    finish(new EditorError('generator_failed', 'The generator returned malformed columns.'));
                } else {
                    finish(
                        null,
                        columnNames.map((name: string, i: number) => ({ name, data: columns[i] }))
                    );
                }
            },
            { signal: done.signal }
        );
        options?.signal?.addEventListener(
            'abort',
            () => finish(new EditorError('cancelled', 'The command was cancelled before it committed.')),
            { signal: done.signal }
        );
        const timer = setTimeout(
            () =>
                finish(new EditorError('timeout', `The generator did not finish within ${TIMEOUT_MS / 1000} seconds.`)),
            TIMEOUT_MS
        );
        done.signal.addEventListener('abort', () => clearTimeout(timer));
        frame.srcdoc = FRAME;
        document.body.appendChild(frame);
    });
};

export { runGenerator, MAX_COUNT as GENERATOR_MAX_COUNT, TIMEOUT_MS as GENERATOR_TIMEOUT_MS };
export type { GaussianColumn, GeneratorParam };
