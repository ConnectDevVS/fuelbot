#!/usr/bin/env bash
# Runs the headless GDScript test suite. Usage: tools/run_tests.sh [--filter=substr]
set -euo pipefail
cd "$(dirname "$0")/.."
GODOT="${GODOT:-godot}"

"$GODOT" --headless --path . --import >/dev/null 2>&1 || true

# --- mock server (IDLE-04) ---

LOG="$(mktemp)"
set +e
"$GODOT" --headless --path . res://tests/TestRunner.tscn -- "$@" 2>&1 | tee "$LOG"
code=${PIPESTATUS[0]}
set -e
if [[ $code -ne 0 ]] || ! grep -q "ALL TESTS PASSED" "$LOG"; then
	echo "run_tests: FAILED (exit $code)" >&2
	exit 1
fi
