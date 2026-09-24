#!/usr/bin/env bash
# One-command dev launch: mock backend + dev provisioning + the kiosk app.
# Usage: tools/dev_run.sh [--scenario=<name>] [--payments=mock|razorpay-test] [--editor] [--fullscreen]
#                         [--no-mock] [-- <godot user args>]
set -euo pipefail
cd "$(dirname "$0")/.."
GODOT="${GODOT:-godot}"
MOCK_PORT=8787

scenario="" editor=0 fullscreen=0 no_mock=0 payments="mock"
passthrough=()
while [[ $# -gt 0 ]]; do
	arg="$1"
	shift
	case "$arg" in
		--) passthrough=("$@"); break ;;
		--scenario=*) scenario="${arg#--scenario=}" ;;
		--payments=*) payments="${arg#--payments=}" ;;
		--editor) editor=1 ;;
		--fullscreen) fullscreen=1 ;;
		--no-mock) no_mock=1 ;;
		*) echo "unknown option: $arg" >&2; exit 2 ;;
	esac
done

if ! command -v "$GODOT" >/dev/null 2>&1 || ! "$GODOT" --version 2>/dev/null | grep -q '^4\.7'; then
	echo "dev_run: Godot 4.7.x not found (set GODOT=/path/to/godot)" >&2
	exit 1
fi
command -v python3 >/dev/null 2>&1 || { echo "dev_run: python3 not found" >&2; exit 1; }

"$GODOT" --headless --path . --import >/dev/null 2>&1 || true

mock_pid=""
if [[ $no_mock -eq 0 ]]; then
	if curl -sf "http://127.0.0.1:$MOCK_PORT/__mock/state" >/dev/null 2>&1; then
		echo "dev_run: reusing mock server already on :$MOCK_PORT"
	else
		python3 mockserver/server.py --port "$MOCK_PORT" >.mock.log 2>&1 &
		mock_pid=$!
		trap '[[ -n "$mock_pid" ]] && kill "$mock_pid" 2>/dev/null || true' EXIT
		for _ in $(seq 50); do
			curl -sf "http://127.0.0.1:$MOCK_PORT/__mock/state" >/dev/null 2>&1 && break
			sleep 0.1
		done
		curl -sf "http://127.0.0.1:$MOCK_PORT/__mock/state" >/dev/null 2>&1 || {
			echo "dev_run: mock server failed to start:" >&2; cat .mock.log >&2; exit 1; }
	fi
	if [[ -n "$scenario" ]]; then
		MOCK_PORT=$MOCK_PORT mockserver/scenario.sh "$scenario" >/dev/null
	fi
	if ! "$GODOT" --headless --path . --script res://tools/dev_setup.gd -- --payments="$payments" >.dev_setup.log 2>&1; then
		cat .dev_setup.log >&2
		exit 1
	fi
else
	"$GODOT" --headless --path . --script res://tools/dev_setup.gd -- --clear >/dev/null 2>&1
fi

cat <<BANNER
────────────────────────────────────────────────────────────
 FuelBot dev run
 Mock backend : $([[ $no_mock -eq 1 ]] && echo "disabled (offline, bundled default config)" || echo "http://127.0.0.1:$MOCK_PORT  (log: .mock.log)")
 Scenario     : ${scenario:-$([[ $no_mock -eq 1 ]] && echo "-" || echo "current")}
 Payments     : $([[ $no_mock -eq 1 ]] && echo "-" || echo "$payments")
 Switch live  : mockserver/scenario.sh maintenance_on | reset
 User data    : $("$GODOT" --headless --path . --script res://tools/dev_setup.gd -- --print-dir 2>/dev/null | sed -n 's/^user data dir: //p' | head -1)
────────────────────────────────────────────────────────────
BANNER

if [[ $editor -eq 1 ]]; then
	"$GODOT" -e --path .
else
	args=(--path .)
	[[ $fullscreen -eq 1 ]] && args+=(--fullscreen)
	[[ ${#passthrough[@]} -gt 0 ]] && args+=(-- "${passthrough[@]}")
	"$GODOT" "${args[@]}"
fi
