#!/usr/bin/env bash
# Runs the headless GDScript test suite. Usage: tools/run_tests.sh [--filter=substr]
set -euo pipefail
cd "$(dirname "$0")/.."
GODOT="${GODOT:-godot}"

"$GODOT" --headless --path . --import >/dev/null 2>&1 || true

# Standalone tool scripts (--script) run without the autoloads, so they mustn't depend on them
# (dev_setup once did, through PinStore). Compile-check each one.
for tool in tools/*.gd; do
	grep -q "^extends SceneTree" "$tool" || continue
	# Captured first: `godot | grep -q` would fail under pipefail when grep exits early.
	check="$("$GODOT" --headless --path . --check-only --script "res://$tool" 2>&1 || true)"
	if grep -q "SCRIPT ERROR" <<<"$check"; then
		echo "run_tests: $tool doesn't compile on its own (see: $GODOT --headless --path . --check-only --script res://$tool)" >&2
		exit 1
	fi
done

# Credentials must never be formatted into output (PAY-03).
if grep -nE '(print|push_warning|push_error|printerr).*(key_id|key_secret|_auth_header)' autoload/RazorpayManager.gd; then
	echo "run_tests: RazorpayManager may log credentials (see above)" >&2
	exit 1
fi
# The machine key likewise (server plan §4.3): `machine_key` itself, not machine_key_path.
if grep -rnE '(print|push_warning|push_error|printerr).*machine_key([^_a-zA-Z0-9]|$)' autoload core scenes tools --include=*.gd; then
	echo "run_tests: the machine key may be logged (see above)" >&2
	exit 1
fi

# The settings PIN (settings set, SET-02): never the PIN, the typed digits or the hash.
if grep -nE '(print|push_warning|push_error|printerr).*[^_a-zA-Z0-9.](pin|_typed|digit|record)([^_a-zA-Z0-9]|$)' \
		core/pin_store.gd scenes/settings_pin/settings_pin.gd ui/components/settings_hold.gd; then
	echo "run_tests: the settings PIN may be logged (see above)" >&2
	exit 1
fi
# Wi-Fi passwords (SET-01): Wifi.gd never formats one into output.
if grep -nE '(print|push_warning|push_error|printerr).*password' autoload/Wifi.gd; then
	echo "run_tests: Wifi.gd may log a Wi-Fi password (see above)" >&2
	exit 1
fi
# The on-screen keyboard holds Wi-Fi passwords (SET-03): never log its text.
if grep -nE '(print|push_warning|push_error|printerr).*_text([^_a-zA-Z0-9]|$)' ui/components/keyboard/keyboard.gd; then
	echo "run_tests: the keyboard may log what was typed (see above)" >&2
	exit 1
fi

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
# test_settings_pin_screen types this PIN, test_wifi uses this password: never in the log.
if grep -qE "918273|SENTINEL3" "$LOG"; then
	echo "run_tests: FAILED (the test settings PIN or Wi-Fi password appears in the log)" >&2
	exit 1
fi
if [[ $code -ne 0 ]] || ! grep -q "ALL TESTS PASSED" "$LOG"; then
	echo "run_tests: FAILED (exit $code)" >&2
	exit 1
fi
