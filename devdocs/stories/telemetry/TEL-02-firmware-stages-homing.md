# TEL-02 — Firmware: stage lines, bounded homing, retry with back-off

**As the** bridge, **I want** the board to announce every stage and to give up
on a limit switch that never triggers, **so that** each cycle can be timed
and a broken switch becomes a reported fault instead of a hung machine.

Plan refs: §3.8 (firmware), §3.10 (HOMING_TIMEOUT is Bucket C); README
decisions 1–4, the serial-line table.
Depends on: TEL-01 (every criterion here is a simulator test).

## Deliverables

```
hardware/firmware/VM_code.ino      # changes marked "// M5:"
hardware/firmware/test_firmware.py # new tests; the M4 line expectations updated
```

## Spec

1. **Stage lines replace the free-text lines** (README table). The
   `Serial.println(" ")` blank line is dropped. `Protein n Dispensed` becomes
   `STATUS:PROTEIN_DISPENSED <h>`. `Mix Done` is removed; `STATUS:DONE`
   already marks the end.
2. **Bounded homing.** `bool homeAxis()` returns `true` when the switch is
   reached. Inside its stepping loop it checks
   `millis() - start > HOMING_TIMEOUT_MS` (`#define HOMING_TIMEOUT_MS 20000`,
   more than double the worst full-travel homing of ~8.5 s from 77 000 steps).
   On timeout: `ENA` LOW, `FAULT:HOMING_TIMEOUT`, `homed = false`, return
   `false`.
3. **Not homed = no cycle.** A global `bool homed`. `setup()` calls
   `homeAxis()` and sets it. In `loop()`, while `!homed`:
   - a received command is answered with `FAULT:NOT_HOMED`, and nothing moves;
   - when `millis() - lastHomingFailure >= retryMs` (measured from the
     **end** of the failed attempt), call `homeAxis()` again.
     `retryMs` starts at `HOMING_RETRY_MS` (60 000), doubles after each
     failure, is capped at `HOMING_RETRY_MAX_MS` (900 000), and resets on
     success.
4. **End-of-cycle homing failure keeps the drink** (decision 3): after
   `moveTo(0)`, a failed `homeAxis()` still leads to `STATUS:DONE`, flush and
   reset. On the next boot, `setup()` tries again; if that fails, step 3 takes
   over.
5. Everything else, including pins, positions, durations and the M4
   validation, is unchanged.

## Acceptance criteria

`test_firmware.py` (simulator):
- [ ] `test_boot_homes`: `STATUS:BOOT`, `STATUS:HOMING_START`,
      `STATUS:HOMING_DONE`.
- [ ] `test_cycle_stage_order`: `12` → exactly `WATER_FILL_1_DONE`,
      `PROTEIN_DISPENSED 1`, `WATER_FILL_2_DONE`, `MIX_DONE`, `HOMING_START`,
      `HOMING_DONE`, `DONE`, in order, with non-decreasing times; then reset
      and `STATUS:BOOT`. No free-text lines remain.
- [ ] `test_homing_timeout_at_boot` (replaces the M4 hang test): switch
      broken → `FAULT:HOMING_TIMEOUT` at 20 s ± 0.5 s, motor stopped (`ENA`
      LOW), **no watchdog reset**.
- [ ] `test_not_homed_refuses_commands`: while faulted, `12` →
      `FAULT:NOT_HOMED`; no motor or pump LOW writes.
- [ ] `test_retry_backoff`: switch broken throughout, `--until 1000` →
      attempts (`HOMING_START` then `FAULT:HOMING_TIMEOUT` 20 s later) start
      at 0, 80, 220 and 480 s. The gaps after each failure are 60, 120 and
      240 s.
- [ ] `test_auto_recovery`: switch broken 0–150 s → the attempts at 0 s and
      80 s fail, the one at ~220 s succeeds (`STATUS:HOMING_DONE`), and a
      `12` sent at 300 s runs a full cycle. The same `12` sent at 150 s gets
      `FAULT:NOT_HOMED`.
- [ ] `test_end_of_cycle_homing_failure_keeps_drink`: switch broken during
      the final homing only → `MIX_DONE`, `HOMING_START`,
      `FAULT:HOMING_TIMEOUT`, **`DONE`**, reset, then the boot homing
      succeeds.
- [ ] M4 behaviours still hold: unassigned and bad commands, one motor per
      hopper.
- [ ] `tools/check_firmware.sh` → `FIRMWARE SYNTAX OK`; `diff` against M4
      shows only `// M5:` changes.

## Out of scope

Real pins for motors 5–6; any sensor; persisting fault counts across resets.
