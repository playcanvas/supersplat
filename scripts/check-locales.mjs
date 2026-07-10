/**
 * Locale consistency check.
 *
 * Verifies every translation in static/locales has exactly the same set of keys
 * as the English reference (en.json, the i18next fallback language). Reports any
 * key that is:
 *   - missing from a translation (the UI would silently fall back to English), or
 *   - stale (present in a translation but no longer in en.json).
 *
 * This is a pure JSON set comparison — it does not scan source, so it has no
 * false positives and needs no dependencies. It deliberately does NOT check for
 * unused or undefined keys, since that requires resolving dynamic localize()
 * call sites and is not worth the complexity. Run via `npm run lint:locales`.
 */

import { readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const localesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'static', 'locales');
const referenceFile = 'en.json';

const keysOf = file => new Set(Object.keys(JSON.parse(readFileSync(join(localesDir, file), 'utf8'))));

const referenceKeys = keysOf(referenceFile);
const localeFiles = readdirSync(localesDir).filter(f => f.endsWith('.json') && f !== referenceFile);

let failed = false;

for (const file of localeFiles) {
    const keys = keysOf(file);
    const missing = [...referenceKeys].filter(k => !keys.has(k));
    const stale = [...keys].filter(k => !referenceKeys.has(k));

    if (missing.length || stale.length) {
        failed = true;
        console.error(`\n${file}:`);
        missing.forEach(k => console.error(`  missing (untranslated): ${k}`));
        stale.forEach(k => console.error(`  stale (not in ${referenceFile}): ${k}`));
    }
}

if (failed) {
    console.error(`\n✖ Locale check failed. Update static/locales so every language has the same keys as ${referenceFile}.`);
    process.exit(1);
}

console.log(`✔ All ${localeFiles.length} locales are in sync with ${referenceFile} (${referenceKeys.size} keys).`);
