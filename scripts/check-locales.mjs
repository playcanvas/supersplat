/**
 * Locale consistency check.
 *
 * Verifies every translation in static/locales has exactly the same keys in the
 * same order as the English reference (en.json, the i18next fallback language).
 * Reports any key that is:
 *   - missing from a translation (the UI would silently fall back to English), or
 *   - stale (present in a translation but no longer in en.json), or
 *   - out of order (locale files use a shared component/UI layout).
 *
 * This is a pure JSON key comparison — it does not scan source, so it has no
 * false positives and needs no dependencies. It deliberately does NOT check for
 * unused or undefined keys, since that requires resolving dynamic localize()
 * call sites and is not worth the complexity. Run via `npm run lint:locales`.
 */

import { readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const localesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'static', 'locales');
const referenceFile = 'en.json';

const keysOf = file => Object.keys(JSON.parse(readFileSync(join(localesDir, file), 'utf8')));

const referenceKeys = keysOf(referenceFile);
const referenceKeySet = new Set(referenceKeys);
const localeFiles = readdirSync(localesDir).filter(f => f.endsWith('.json') && f !== referenceFile);

let failed = false;

for (const file of localeFiles) {
    const keys = keysOf(file);
    const keySet = new Set(keys);
    const missing = referenceKeys.filter(k => !keySet.has(k));
    const stale = keys.filter(k => !referenceKeySet.has(k));
    const orderMismatch = missing.length === 0 && stale.length === 0 ?
        keys.findIndex((key, index) => key !== referenceKeys[index]) : -1;

    if (missing.length || stale.length || orderMismatch !== -1) {
        failed = true;
        console.error(`\n${file}:`);
        missing.forEach(k => console.error(`  missing (untranslated): ${k}`));
        stale.forEach(k => console.error(`  stale (not in ${referenceFile}): ${k}`));
        if (orderMismatch !== -1) {
            console.error(`  out of order at key ${orderMismatch + 1}: expected ${referenceKeys[orderMismatch]}, found ${keys[orderMismatch]}`);
        }
    }
}

if (failed) {
    console.error(`\n✖ Locale check failed. Update static/locales so every language has the same keys as ${referenceFile}.`);
    process.exit(1);
}

console.log(`✔ All ${localeFiles.length} locales are in sync with ${referenceFile} (${referenceKeys.length} keys).`);
