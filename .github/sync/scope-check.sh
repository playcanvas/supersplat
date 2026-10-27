#!/usr/bin/env bash
# Fails when the agent's edits on top of git's own merge reach outside the source, leave conflict
# markers, or switch a check off. Run in the work tree after the merge is committed.
# usage: scope-check.sh <automerge tree>
set -euo pipefail

automerge="$1"
status=0

outside="$(git diff --name-only "$automerge" HEAD | grep -Ev '^(src/|static/|package\.json$|package-lock\.json$)' || true)"
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

silenced="$(git diff "$automerge" HEAD -- src | grep -E '^\+.*(@ts-ignore|@ts-expect-error|@ts-nocheck|eslint-disable)' || true)"
if [ -n "$silenced" ]; then
	echo "The agent switched a check off:"
	echo "$silenced"
	status=1
fi

exit "$status"
