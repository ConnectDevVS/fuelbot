# TEL-01 — Firmware host simulator

**As a** developer with no Arduino on the desk, **I want** to run the real
`VM_code.ino` against a simulated board, **so that** firmware changes are
verified by behaviour (lines, timing, what moves), not just by a syntax check.

Plan refs: §6 (the rig levels; this adds a "Level ½" for firmware); README
decision 11.
Depends on: nothing in this set.

## Verified before writing (spike, 2026-09-24)

- The unmodified M4 sketch compiles with `clang++ -std=c++11` inside
  `struct Board { #include "VM_code.ino" };`, against ~40 lines of stub
  Arduino API. It runs a full hopper-1 cycle in milliseconds of real time:
  boot homing from carriage 30 000 took 3.0 s virtual, and the cycle ended
  `STATUS:DONE` at 73.7 s virtual, then `<watchdog reset>`.
- **Wrapping in a struct is required.** Calling `setup()` again after the
  simulated reset kept `protein`/`base` in RAM and re-ran the cycle. A
  fresh `Board` per boot gives real reset semantics.
- `52` → `FAULT:HOPPER_UNASSIGNED 5` with the carriage unmoved. That is the
  first behavioural confirmation of DSP-03's fail-safe.

## Deliverables

```
hardware/firmware/host_sim/sim.cpp        # the simulated board + driver
hardware/firmware/host_sim/Arduino.h      # stub API with implementations declared (replaces host_stub for the sim)
hardware/firmware/host_sim/avr/wdt.h
hardware/firmware/test_firmware.py        # unittest: builds the sim, runs scenarios, asserts on output
tools/check_firmware.sh                   # also builds the simulator (fails if it doesn't compile)
```

`host_stub/` (the syntax-check stubs) is folded into `host_sim/`: one set of
headers.

## Spec

### Simulated board (`sim.cpp`)

- **Clock:** `delay()` and `delayMicroseconds()` advance a virtual µs
  counter; `millis()` reads it. Every other stub costs 0 time.
- **Carriage:** a rising edge on `X` (pin 11) while `ENA` (8) is HIGH moves
  the carriage one step, towards 0 when `DIR` (9) is HIGH, otherwise away.
  `Z` (10) steps are counted but don't move the carriage.
- **Limit switch** (pin 22, active LOW): LOW when `carriage <= 0`, unless the
  switch is **broken** (always HIGH) for a time window.
- **Pins:** the last value written to every pin is recorded, plus a
  per-pin count of LOW writes to the motor pins (M1–M4, PU, MIX), so a test
  can assert that "nothing was dispensed".
- **Serial:** input lines are queued with the virtual time at which they
  become `available()`. Output lines are printed as `<seconds>\t<line>`.
- **Watchdog:** `wdt_enable()` throws `Reset`. The driver catches it,
  prints `<t>\t<watchdog reset>`, and boots a new `Board` (fresh RAM). The
  carriage, switch and clock carry over, because they're physical.
- **Driver CLI:** `sim [--start-pos N] [--broken-limit FROM:TO]
  [--at T:LINE]... [--until SECONDS] [--max-boots N]`. It runs `loop()`
  until the virtual clock passes `--until` (default 400 s). At the end it
  prints `END\tcarriage=<n>\tlow_writes=<pin>:<n>,...`.

### `test_firmware.py`

Builds the binary once per test run into a temp dir (`clang++ -std=c++11
-I host_sim -x c++ host_sim/sim.cpp`), and skips with a clear message if
`clang++` is missing. It runs scenarios and parses the output into
`[(t, line)]`.

## Acceptance criteria

Against the **current (M4) firmware**:
- [ ] `test_boot_homes`: start 30 000 → `Reset!`, `Homing`, `Home reached`
      within 5 s; carriage 0.
- [ ] `test_cycle_hopper1`: `12` → the M4 line sequence ending `Mix Done`,
      `STATUS:DONE`, `<watchdog reset>`, then one clean boot and **no**
      second cycle. `STATUS:DONE` arrives at 60–85 s virtual.
- [ ] `test_each_hopper_dispenses_its_motor`: `12`…`42` → only that hopper's
      motor pin was driven LOW.
- [ ] `test_unassigned_and_bad_commands`: `52`, `62` →
      `FAULT:HOPPER_UNASSIGNED <h>`; `72`, `13`, `ab` → `FAULT:BAD_COMMAND`.
      In every case no motor or pump pin was driven LOW and the carriage is
      unmoved.
- [ ] `test_broken_limit_hangs_m4`: a broken switch at boot → still no
      `Home reached` at `--until 120` (this documents the M4 hang that TEL-02
      fixes; TEL-02 flips this test).
- [ ] `tools/check_firmware.sh` builds the simulator as well as the syntax
      check.

## Out of scope

AVR-accurate timing, interrupts, registers, EEPROM; a GUI.
