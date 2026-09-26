#!/usr/bin/env bash
# Boots the main scene headless for ~5 s, sandboxed, and fails on script/parse errors.
set -euo pipefail
cd "$(dirname "$0")/.."
GODOT="${GODOT:-godot}"

LOG="$(mktemp)"
# --sandbox: no tenant, no dev override, state under user://sandbox/ (never the developer's files).
"$GODOT" --headless --path . --max-fps 60 --quit-after 300 -- --sandbox >"$LOG" 2>&1 || true
PATTERN='SCRIPT ERROR|Parse Error|Failed loading resource|Failed to load script|Invalid call|Nonexistent function'
if grep -Eq "$PATTERN" "$LOG"; then
	grep -E -A3 "$PATTERN" "$LOG"
	echo "BOOT FAILED"
	exit 1
fi
echo "BOOT OK"
