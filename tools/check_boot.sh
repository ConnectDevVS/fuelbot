#!/usr/bin/env bash
# Boots the main scene headless for ~5 s and fails on script/parse errors.
set -euo pipefail
cd "$(dirname "$0")/.."
GODOT="${GODOT:-godot}"

LOG="$(mktemp)"
"$GODOT" --headless --path . --max-fps 60 --quit-after 300 >"$LOG" 2>&1 || true
PATTERN='SCRIPT ERROR|Parse Error|Failed loading resource|Failed to load script|Invalid call|Nonexistent function'
if grep -Eq "$PATTERN" "$LOG"; then
	grep -E -A3 "$PATTERN" "$LOG"
	echo "BOOT FAILED"
	exit 1
fi
echo "BOOT OK"
