# Upstream Sync Process

How this fork stays in sync with [playcanvas/supersplat](https://github.com/playcanvas/supersplat)
while preserving the Braintrance customizations.

## Branch model

| Branch | Role |
| --- | --- |
| `main` | Pristine mirror of upstream `playcanvas/supersplat:main`. No fork changes live here. It is the repo's **default branch**. |
| `sync` | Integration branch. Carries **all** Braintrance customizations (iframe integration, annotations, view manager, render sub-panel, reveal effect, light theme) and is where each upstream release is merged and verified. |
| `braintrance` | The released fork. Updated from `sync` once a sync has been verified. |

Ancestry today: `main ⊆ sync` and `main ⊆ braintrance`. The intended flow of changes is:

```
upstream/main  ──►  main (mirror)  ──►  sync (merge + verify)  ──►  braintrance (release)
```

## Automated part: `.github/workflows/sync-upstream.yml`

The workflow has two jobs:

1. **sync** merges `upstream/main` into `main` and pushes it (keeping the mirror current).
2. **land**, whenever `braintrance` is missing anything on `main`:
   1. merges `main` into a copy of `braintrance`;
   2. if git stops on conflicts, a Codex agent resolves them (`.github/sync/resolve-prompt.md`), keeping
      upstream's change and re-applying the fork's on top;
   3. commits, then refuses the result (`scope-check.sh`) if the agent edited anything outside
      `src/`, `static/` and `package.json`, left conflict markers, or added `@ts-ignore`/`eslint-disable`;
   4. runs the verification block below plus a browser smoke test (`gates.sh`, `smoke.mjs`); on failure
      the agent gets one attempt to fix it (`fix-prompt.md`) and the checks run again;
   5. checks the fork survived (`fork-guard.mjs`): every fork-only file and every string in
      `fork-markers.json` must still be there, and every line the fork added that no longer appears
      verbatim is listed;
   6. a second, read-only agent reviews that list and the resolving agent's edits and answers `merge`
      or `hold` (`review-prompt.md`);
   7. opens a `sync/upstream-<date>` PR into `braintrance` with all of the above, and on `merge`
      fast-forwards `braintrance` to it, which marks the PR merged. Anything else leaves the PR open
      with the `sync-needs-human` label. Older open sync PRs are closed as superseded.

The checks and prompts are read from the workflow's own commit on `main`, never from the tree being
merged, so the agent cannot edit what judges it. The agent needs the `OPENAI_API_KEY` repository
secret; without it a conflicted sync is held for a human.

When the fork gains a feature, add its anchor strings to `.github/sync/fork-markers.json` and, if it
renders something, a selector to `smoke.mjs`.

Runs every 2 days at 09:00 UTC (`cron: '0 9 */2 * *'`) and can also be triggered manually
(**Actions → Sync with Upstream → Run workflow**).

> [!IMPORTANT]
> GitHub only triggers **scheduled** (`schedule`) workflows from the workflow file on the
> **default branch**. This file must therefore live on `main` for the cron to fire — editing the
> cron only on `sync`/`braintrance` changes nothing. `workflow_dispatch` (manual run) works from
> any branch the file exists on.

> [!NOTE]
> The automation lands on `braintrance` directly, bypassing the `sync` integration branch that the
> manual process below uses. Use the manual route for a sync the bot held.

## Manual sync (the reliable route)

Upstream releases are merged into `sync` first, verified, then `sync` is merged into `braintrance`.

### 1. Merge the upstream release into `sync`

```bash
git fetch upstream
git checkout -b sync-merge-vX.Y.Z origin/sync
git merge --no-ff <upstream-release-sha> \
  -m "Merge upstream playcanvas/supersplat main (vX.Y.Z) into sync (PR #NN)"
```

The merge is usually **conflict-free**, because a past manual file-copy upgrade left git treating
pure-upstream code as fork changes — most apparent conflicts have zero real fork delta. When a
conflict does appear, resolve it by diffing against the matching upstream release tag:

```bash
git fetch https://github.com/playcanvas/supersplat.git \
  'refs/tags/vX.Y.Z:refs/tags/upstream-vX.Y.Z' --no-tags
git diff upstream-vX.Y.Z origin/sync -- <file>   # empty delta → take upstream verbatim
```

### 2. Verify (do not skip — this is the whole point)

```bash
npm install            # deps often bump (playcanvas, splat-transform, mediabunny, postcss)
npx tsc --noEmit       # catches fork-only files broken by upstream API renames — git will NOT
npm run build          # rollup bundle must succeed
npm run lint           # 0 errors expected (3 no-new warnings in main.ts are the known fork pattern)
npm run lint:locales   # all locales in sync with en.json
```

Confirm the fork customizations survived the merge (a textually clean auto-merge can still drop a
feature if upstream rewrote the same file):

- `src/main.ts` — `AnnotationManager`, `registerIframeApi`, `initIframeIntegration`, `ViewManager`
- `src/editor.ts` — both `revealEffect` (fork) and `fovDolly` (upstream)
- `src/ui/editor.ts` — `RenderSubPanel` alongside `SettingsPanel`
- `src/ui/scss/style.scss` — `colors`, `mode-toggle`, `iframe-controls`, `render-sub-panel`,
  `annotation-overlay` imports and the PCUI light-theme overrides

### 3. Land it

Fast-forward-push the verified merge commit to `sync`. Because the merge commit's parents include the
upstream head, this marks any corresponding cross-repo PR as merged:

```bash
git push origin sync-merge-vX.Y.Z:sync
```

### 4. Propagate to `braintrance`

Open a PR merging `sync` into `braintrance` and merge once reviewed.

## Gotchas

- **Fork-only files break silently** on upstream API renames/removals. `git merge` reports no
  conflict; only `tsc --noEmit` catches it. Always run the verification block. (Example: an upstream
  splat-serialize rewrite removed `serializePly*` in favor of `writeSplatFile(...)`, which the
  fork-only `iframe-integration.ts` had to migrate to.)
- **The Vercel status check fails** with an "authorize" URL — that is an unauthorized-integration
  issue, not a build failure. It leaves the PR `UNSTABLE`, which is expected.
- **`git fetch <url> <tag>` clobbers `FETCH_HEAD`** — use explicit SHAs when resolving conflicts.
