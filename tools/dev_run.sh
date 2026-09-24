#!/usr/bin/env bash
# One-command dev launch: mock backend + dev provisioning + the kiosk app.
# Usage: tools/dev_run.sh [--scenario=<name>] [--payments=mock|razorpay-test] [--editor] [--fullscreen]
#                         [--no-mock] [--skip-port-check] [-- <godot user args>]
# Refuses to start if another program (usually a second copy of the app, e.g. the
# game running inside the Godot editor) already listens on the bridge result port
# (4245): the bridge's DONE would go to that copy, and this one would show
# "Something went wrong" after the safety cap.
set -euo pipefail
cd "$(dirname "$0")/.."
GODOT="${GODOT:-godot}"
MOCK_PORT=8787

scenario="" editor=0 fullscreen=0 no_mock=0 payments="mock" port_check=1
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
		--skip-port-check) port_check=0 ;;
		*) echo "unknown option: $arg" >&2; exit 2 ;;
	esac
done

if ! command -v "$GODOT" >/dev/null 2>&1 || ! "$GODOT" --version 2>/dev/null | grep -q '^4\.7'; then
	echo "dev_run: Godot 4.7.x not found (set GODOT=/path/to/godot)" >&2
	exit 1
fi
command -v python3 >/dev/null 2>&1 || { echo "dev_run: python3 not found" >&2; exit 1; }

# UDP ports from local_settings.bridge (+ the user:// override, if any).
read -r order_port listen_port < <(python3 - <<'PY'
import json, os
cfg = json.load(open("config/local_settings.json")).get("bridge", {})
for d in ("~/Library/Application Support/Godot/app_userdata/FuelBot",
          "~/.local/share/godot/app_userdata/FuelBot"):
    path = os.path.join(os.path.expanduser(d), "local_settings.override.json")
    if os.path.exists(path):
        try:
            cfg.update(json.load(open(path)).get("bridge", {}))
        except ValueError:
            pass
        break
print(int(cfg.get("order_port", 4242)), int(cfg.get("listen_port", 4245)))
PY
)

# True if nothing on this machine is bound to 127.0.0.1:<port> (UDP).
udp_port_free() {
	python3 -c 'import socket,sys; socket.socket(socket.AF_INET, socket.SOCK_DGRAM).bind(("127.0.0.1", int(sys.argv[1])))' "$1" 2>/dev/null
}

if [[ $port_check -eq 1 ]] && ! udp_port_free "$listen_port"; then
	echo "dev_run: UDP $listen_port (bridge results) is already taken by:" >&2
	if command -v lsof >/dev/null 2>&1; then
		lsof -nP -iUDP:"$listen_port" 2>/dev/null | awk 'NR>1 {print "  pid " $2 ": " $1}' | sort -u >&2
		lsof -nP -iUDP:"$listen_port" 2>/dev/null | awk 'NR>1 {print $2}' | sort -u | while read -r pid; do
			echo "    $(ps -o command= -p "$pid" 2>/dev/null | cut -c1-110)" >&2
		done
	fi
	cat >&2 <<MSG
Run only ONE copy of the app. Probably the game is still running inside the Godot
editor (stop it with F8) or another dev_run window is open (quit it).
Otherwise the bridge's DONE goes to that copy, and this one shows
"Something went wrong" after the safety cap.
(--skip-port-check starts anyway, e.g. for a second window that won't dispense.)
MSG
	exit 1
fi
bridge_note="running on :$order_port"
if udp_port_free "$order_port"; then
	bridge_note="NONE on :$order_port. Orders will fail after the safety cap. Start one: python3 tools/fake_dispense_bridge.py --mode done"
fi

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
 Bridge       : $bridge_note
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
