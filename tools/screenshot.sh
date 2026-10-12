#!/usr/bin/env bash
# Captures a real-time screenshot of a scene (or the main scene).
# Usage: tools/screenshot.sh <res://path/Scene.tscn|main> [out.png] [delay_sec] [flavor id to select]
set -euo pipefail
cd "$(dirname "$0")/.."
GODOT="${GODOT:-godot}"

scene="${1:?usage: tools/screenshot.sh <scene|main> [out.png] [delay_sec]}"
if [[ "$scene" == "main" ]]; then
	name="main"
	scene_arg=()
else
	name="$(basename "$scene" .tscn)"
	scene_arg=("$scene")
fi
out="${2:-.screenshots/$name.png}"
delay="${3:-4}"
select_arg=()
[[ -n "${4:-}" ]] && select_arg=(--select="$4")
mkdir -p "$(dirname "$out")"
case "$out" in /*) abs="$out" ;; *) abs="$(pwd)/$out" ;; esac
rm -f "$abs"

"$GODOT" --path . "${scene_arg[@]+"${scene_arg[@]}"}" -- --capture="$abs" --capture-delay="$delay" "${select_arg[@]+"${select_arg[@]}"}" >/dev/null 2>&1 || true
if [[ ! -f "$abs" ]]; then
	echo "screenshot: no image written" >&2
	exit 1
fi
echo "$out"
