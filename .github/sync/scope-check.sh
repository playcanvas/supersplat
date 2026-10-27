#!/usr/bin/env bash
# Fails when the agent's edits on top of git's own merge reach outside the source, leave conflict
# markers, or switch a check off. Run in the work tree with the merge checked out.
# usage: scope-check.sh <fork commit> <upstream commit>
set -euo pipefail

# Recomputed in every job: a merge-tree result is never referenced by the merge, so no bundle carries it.
automerge="$(git merge-tree --write-tree "$1" "$2" | head -1 || true)"
git cat-file -e "$automerge^{tree}"
status=0

changed="$(git diff --name-only "$automerge" HEAD)"
outside="$(grep -Ev '^(src/|static/|package\.json$|package-lock\.json$)' <<<"$changed" || true)"
if [ -n "$outside" ]; then
	echo "The agent changed files outside src/, static/ and package.json:"
	echo "$outside"
	status=1
fi

markers="$(git grep -lE '^(<<<<<<<|>>>>>>>)( |$)' HEAD -- src static package.json || true)"
if [ -n "$markers" ]; then
	echo "Conflict markers remain in:"
	echo "$markers"
	status=1
fi

added="$(git diff "$automerge" HEAD -- src)"
silenced="$(grep -E '^\+.*(@ts-ignore|@ts-expect-error|@ts-nocheck|eslint-disable)' <<<"$added" || true)"
if [ -n "$silenced" ]; then
	echo "The agent switched a check off:"
	echo "$silenced"
	status=1
fi

exit "$status"
