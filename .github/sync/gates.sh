#!/usr/bin/env bash
# The checks UPSTREAM_SYNC.md asks for before a sync lands, plus the smoke test.
# usage: gates.sh <work tree> <tools directory> <log file>
set -uo pipefail

work="$1"
tools="$2"
log="$3"
: >"$log"

run() {
	echo "::group::$1"
	echo "### $1" >>"$log"
	shift
	if (cd "$work" && "$@") >>"$log" 2>&1; then
		echo "::endgroup::"
		return 0
	fi
	echo "::endgroup::"
	echo "FAILED: $*" | tee -a "$log"
	return 1
}

run "install" npm ci --no-audit --no-fund &&
	run "typecheck" npx --no-install tsc --noEmit &&
	run "build" npm run build &&
	run "lint" npm run lint &&
	run "lint locales" npm run lint:locales &&
	run "smoke" node "$tools/smoke.mjs" "$work/dist"
