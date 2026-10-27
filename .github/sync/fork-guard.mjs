// Checks that a merge of upstream into braintrance kept the fork's own changes.
// usage: node fork-guard.mjs <base> <fork> <result> <markers.json> <report.md>
//   base   the merge base of braintrance and main before the merge
//   fork   braintrance before the merge
//   result the merge being judged
// Exits 1 when a fork-only file is gone or a marker is missing. Fork lines that no longer appear
// are listed for the reviewing agent, not failed here: upstream rewrites legitimately move them.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const [base, fork, result, markersPath, reportPath] = process.argv.slice(2);
if (!reportPath) {
    console.error('usage: node fork-guard.mjs <base> <fork> <result> <markers.json> <report.md>');
    process.exit(2);
}

const options = { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 };
const git = (...args) => execFileSync('git', args, options);

const show = (rev, path) => {
    try {
        return execFileSync('git', ['show', `${rev}:${path}`], { ...options, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
        return null;
    }
};

const ignored = path => path === 'package-lock.json' || path.startsWith('.github/sync/');

// A line made only of brackets, punctuation or a lone keyword says nothing about whether a feature survived.
const meaningful = line => (line.match(/[A-Za-z0-9_$-]/g) ?? []).length >= 6;

const hard = [];
const soft = [];

const changes = git('diff', '--name-status', '--no-renames', base, fork)
    .split('\n')
    .filter(Boolean)
    .map(row => row.split('\t'))
    .filter(([, path]) => !ignored(path));

for (const [status, path] of changes) {
    if (status === 'D') continue;

    const merged = show(result, path);
    if (merged === null && status === 'A') {
        hard.push(`\`${path}\` was added by the fork and is gone from the merge.`);
        continue;
    }
    // Upstream may have moved or deleted a file the fork changed; whether the change was ported is the reviewer's call.
    if (merged === null) {
        soft.push({ path, lost: ['(the whole file is gone from the merge; the fork changed it)'] });
        continue;
    }

    const present = new Set(merged.split('\n').map(line => line.trim()));
    const added = git('diff', '-U0', '--no-color', base, fork, '--', path)
        .split('\n')
        .filter(line => line.startsWith('+') && !line.startsWith('+++'))
        .map(line => line.slice(1).trim())
        .filter(meaningful);
    const lost = [...new Set(added.filter(line => !present.has(line)))];
    if (lost.length > 0) soft.push({ path, lost });
}

const markers = JSON.parse(readFileSync(markersPath, 'utf8'));
for (const [path, needles] of Object.entries(markers)) {
    if (path.startsWith('//')) continue;

    const merged = show(result, path);
    for (const needle of needles) {
        if (merged === null || !merged.includes(needle)) hard.push(`\`${path}\` no longer contains \`${needle}\`.`);
    }
}

const lostCount = soft.reduce((sum, { lost }) => sum + lost.length, 0);
let report = '## Fork guard\n\n';
report += hard.length === 0 ? 'Every fork-only file and marker is present.\n\n' : `**${hard.length} hard failure(s):**\n\n${hard.map(h => `- ${h}`).join('\n')}\n\n`;
report += lostCount === 0
    ? 'Every line the fork added is still in the merge.\n'
    : `${lostCount} line(s) the fork added no longer appear verbatim (for review):\n\n${soft.map(({ path, lost }) => `<details><summary>${path} (${lost.length})</summary>\n\n\`\`\`\n${lost.join('\n')}\n\`\`\`\n</details>`).join('\n')}\n`;
writeFileSync(reportPath, report);
console.log(report);
process.exit(hard.length === 0 ? 0 : 1);
