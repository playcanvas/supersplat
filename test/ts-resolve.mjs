// Node module hook for running the tsc-emitted sources (test/.build). The
// sources import each other without extensions (rollup resolves them), so try
// `.js` for an extensionless relative specifier before falling through, and
// mark the emitted files as ES modules (the emit has no package.json "type").
// Register with `--import ./test/register.mjs`.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) && context.parentURL) {
        const candidate = new URL(`${specifier}.js`, context.parentURL);
        if (existsSync(fileURLToPath(candidate))) {
            specifier = candidate.href;
        } else {
            const index = new URL(`${specifier}/index.js`, context.parentURL);
            if (existsSync(fileURLToPath(index))) specifier = index.href;
        }
    }
    const result = await nextResolve(specifier, context);
    if (result.url.includes('/test/.build/') && result.url.endsWith('.js')) {
        return { ...result, format: 'module' };
    }
    return result;
}
