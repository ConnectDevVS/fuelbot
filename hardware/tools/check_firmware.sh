#!/usr/bin/env bash
# Host checks of the Arduino sketch (arduino-cli isn't installed here):
#  1. syntax/type check of VM_code.ino against the host Arduino API headers;
#  2. builds the firmware simulator (hardware/firmware/host_sim), which
#     hardware/firmware/test_firmware.py runs for behavioural tests.
# Neither is an AVR compile: Level 2 is the real compile + flash.
set -euo pipefail
cd "$(dirname "$0")/.."
CXX="${CXX:-clang++}"
command -v "$CXX" >/dev/null 2>&1 || { echo "check_firmware: $CXX not found" >&2; exit 1; }
SIM=hardware/firmware/host_sim
"$CXX" -std=c++11 -fsyntax-only -Wall -Werror -Wno-tautological-compare -Wno-unused-variable \
	-x c++ -I "$SIM" hardware/firmware/VM_code.ino
out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT
"$CXX" -std=c++11 -Wall -Werror -Wno-tautological-compare -Wno-unused-variable \
	-I "$SIM" -x c++ "$SIM/sim.cpp" -o "$out/sim"
echo "FIRMWARE SYNTAX OK (simulator builds)"
