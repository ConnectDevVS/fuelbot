# DSP-03 — Firmware: `STATUS:DONE`, command validation, motors 5–6 placeholders

**As the** bridge, **I want** the Arduino to say when a drink is finished and
to refuse commands it can't carry out safely, **so that** "done" is a real
signal and a hopper without a motor never drives pin −1 or pumps water
forever.

Plan refs: §3.7 (firmware), §2.2.6 (only `VM_code.ino` is touched), §6
Level 2; README decisions 1 and 14.
Depends on: nothing in this set.

## Verified before writing (2026-09-24)

- `fuelbotsource_og/VM_code.ino` (16 Sept, Arduino Mega) is the current
  sketch. `vmcode.ino` and `vmcode/vmcode.ino` are older and use different
  pins.
- **Existing hazard:** a command whose first digit isn't 1–4 (e.g. `52`)
  passes the 2-digit check, fills water, skips every protein branch, leaves
  `mix == false`, and so never reaches `resetArduino()`. `loop()` then
  repeats the water fill **forever**. Validation at parse time fixes that for
  5–6 and for every other digit.
- `arduino-cli` isn't installed. `clang++` is. A host `-fsyntax-only` compile
  against stub headers is possible (decision 14).

## Deliverables

```
hardware/firmware/VM_code.ino       # ported forward; only the changes below
hardware/firmware/host_stub/Arduino.h, host_stub/avr/wdt.h   # declarations only, for the syntax check
tools/check_firmware.sh             # clang++ -fsyntax-only -x c++ with the stubs
```

## Spec

Port `VM_code.ino` **as is**: pins, positions, durations, the commented-out
milk and cleaning blocks, and all existing `Serial.println` texts. The
bridge's recovery depends on `Home reached`, so that text must not change.
Then make only these changes, each marked `// M4:` so review is easy:

1. **Motors 5–6 placeholders**
   ```cpp
   #define M5 -1        // TODO(wiring): assign pin for hopper 5
   #define M6 -1        // TODO(wiring): assign pin for hopper 6
   #define M5_POS 72000 // TODO(wiring): placeholder stepper position
   #define M6_POS 72000 // TODO(wiring): placeholder stepper position
   #define M5_MS 1000   // TODO(wiring): placeholder dispense duration
   #define M6_MS 1000   // TODO(wiring): placeholder dispense duration
   ```
   `pinMode`/`digitalWrite(HIGH)` in `setup()` and the dispense branches for
   5 and 6 sit inside `#if M5 >= 0` / `#if M6 >= 0`, so pin −1 is never
   touched and the branches compile away until the pins are assigned.
2. **Validation where the command is parsed** (the only new logic):
   - `bool hopperAssigned(int p)`: 1–4 → true; 5 → `M5 >= 0`; 6 → `M6 >= 0`;
     otherwise false.
   - A 2-digit command whose hopper is 1–6 but unassigned →
     `Serial.println("FAULT:HOPPER_UNASSIGNED <p>")`.
   - Hopper not in 1–6, or base not 1–2 → `Serial.println("FAULT:BAD_COMMAND")`.
   - A non-empty message that isn't 2 digits → `FAULT:BAD_COMMAND` (it was
     silently ignored before).
   - On any fault, `protein = base = 0`, so the cycle doesn't start and
     **nothing moves**.
3. **`STATUS:DONE`** at the end of the cycle: after the existing
   `Serial.println("Mix Done")` and before `Serial.flush(); delay(100);
   resetArduino();`.
4. A comment block at the top: the serial protocol (the command, the
   `STATUS:DONE`/`FAULT:*` lines, and `Home reached` as the ready signal) and
   a `TODO(M5)` noting that `homeAxis()` is still unbounded
   (`FAULT:HOMING_TIMEOUT` is Milestone 5).

No bounded homing: that's Milestone 5. Doing it now would change the
recovery behaviour that Level 2 hasn't verified.

### `tools/check_firmware.sh`

`clang++ -std=c++11 -fsyntax-only -x c++ -I hardware/firmware/host_stub
hardware/firmware/VM_code.ino`. (Spiked on the **old** sketch with scratch
stubs: it passes, so the check is useful as a baseline.) It prints `FIRMWARE SYNTAX OK` or fails.
The stubs declare `pinMode`, `digitalWrite`, `digitalRead`, `analogWrite`,
`delay`, `delayMicroseconds`, `isDigit`, a `String` with `trim`/`length`/
`charAt`, a `Serial` object, `wdt_enable` and the constants. The sketch
already has `#include <Arduino.h>` and defines functions before use, so the
IDE's generated prototypes aren't needed.

## Acceptance criteria

- [ ] `tools/check_firmware.sh` → `FIRMWARE SYNTAX OK`.
- [ ] `diff` between the old and new sketch shows only the `// M4:` changes
      (reviewed and pasted into the SIGNOFF as a summary).
- [ ] With `M5 -1`, a sketch-level read-through confirms that `52` → the
      fault line, `protein = 0`, no pin written. The same for `92`, `13` and
      `ab`. (There's no AVR emulator here. `tools/fake_arduino_serial.py` in
      DSP-04 mirrors this behaviour and is tested.)
- [ ] `STATUS:DONE` is printed once per completed cycle, after `Mix Done`.

## Out of scope

Real pins, positions and durations for 5–6; `FAULT:HOMING_TIMEOUT`/bounded
homing and the `STATUS:*` stage lines (Milestone 5); flashing (Level 2,
DSP-06 pending steps).
