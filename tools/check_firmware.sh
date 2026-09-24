#!/usr/bin/env bash
# Host syntax check of the Arduino sketch (arduino-cli isn't installed here).
# Type-checks VM_code.ino with clang++ against minimal Arduino stub headers.
# Catches typos and type errors, not AVR-specific problems: Level 2 is the real compile + flash.
set -euo pipefail
cd "$(dirname "$0")/.."
CXX="${CXX:-clang++}"
command -v "$CXX" >/dev/null 2>&1 || { echo "check_firmware: $CXX not found" >&2; exit 1; }
"$CXX" -std=c++11 -fsyntax-only -Wall -Werror -Wno-tautological-compare -Wno-unused-variable \
	-x c++ -I hardware/firmware/host_stub hardware/firmware/VM_code.ino
echo "FIRMWARE SYNTAX OK"
