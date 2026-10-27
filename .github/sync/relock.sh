#!/usr/bin/env bash
# Regenerates package-lock.json whenever the merge touched either manifest: a textually clean merge
# of two lockfiles can still leave a dependency out, and `npm ci` then refuses the tree.
# usage: relock.sh <fork commit>   (run in the work tree, before committing)
set -euo pipefail

if ! git diff --quiet "$1" -- package.json package-lock.json; then
	npm install --package-lock-only --ignore-scripts --no-audit --no-fund
fi
