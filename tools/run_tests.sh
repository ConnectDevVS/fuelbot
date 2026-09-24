#!/usr/bin/env bash
# Runs the headless GDScript test suite. Usage: tools/run_tests.sh [--filter=substr]
set -euo pipefail
cd "$(dirname "$0")/.."
GODOT="${GODOT:-godot}"

"$GODOT" --headless --path . --import >/dev/null 2>&1 || true

# --- mock server (IDLE-04) ---
MOCK_PORT=8788
if curl -sf "http://127.0.0.1:$MOCK_PORT/__mock/state" >/dev/null 2>&1; then
	echo "run_tests: port $MOCK_PORT is already in use (stale mock server?). Stop it first." >&2
	exit 1
fi
MOCK_LOG="$(mktemp)"
python3 mockserver/server.py --port "$MOCK_PORT" >"$MOCK_LOG" 2>&1 &
MOCK_PID=$!
trap 'kill $MOCK_PID 2>/dev/null || true' EXIT
for _ in $(seq 50); do
	curl -sf "http://127.0.0.1:$MOCK_PORT/__mock/state" >/dev/null 2>&1 && break
	sleep 0.1
done
if ! curl -sf "http://127.0.0.1:$MOCK_PORT/__mock/state" >/dev/null 2>&1; then
	echo "run_tests: mock server did not start:" >&2
	cat "$MOCK_LOG" >&2
	exit 1
fi

LOG="$(mktemp)"
set +e
"$GODOT" --headless --path . res://tests/TestRunner.tscn -- "$@" 2>&1 | tee "$LOG"
code=${PIPESTATUS[0]}
set -e
# A script error aborts a test coroutine before its asserts run, so treat any as a failure.
if grep -Eq "SCRIPT ERROR|Parse Error" "$LOG"; then
	echo "run_tests: FAILED (script errors in log, see above)" >&2
	exit 1
fi
if [[ $code -ne 0 ]] || ! grep -q "ALL TESTS PASSED" "$LOG"; then
	echo "run_tests: FAILED (exit $code)" >&2
	exit 1
fi
