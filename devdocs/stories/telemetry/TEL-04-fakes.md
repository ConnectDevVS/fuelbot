# TEL-04 — Test-rig fakes: new lines, homing faults, telemetry

**As a** developer without the machine, **I want** the fakes to behave like
the M5 firmware and bridge, including homing faults, **so that** Level 0 and
Level 1 exercise telemetry and the maintenance flip.

Plan refs: §6 Levels 0 and 1 (the telemetry on 4246 and the
`homing_timeout` fault originally planned there); README decisions 2–5.
Depends on: TEL-02 (the firmware behaviour mirrored), TEL-03 (the event
shapes).

## Deliverables

```
tools/fake_arduino_serial.py     # M5 lines, homing faults with back-off
tools/fake_dispense_bridge.py    # 4246 events + heartbeat, --homing-fault-sec
tools/test_fakes.py              # updated + new, incl. automated Level 1 homing cases
```

## Spec

### `fake_arduino_serial.py`

- Prints the M5 lines (README table) at the same timings as before.
- New faults:
  - `homing_timeout`: the limit switch is broken for good. The boot homing
    prints `STATUS:HOMING_START`, then `FAULT:HOMING_TIMEOUT` 20 s later
    (both scaled by `--time-scale`), then retries with the firmware's
    back-off. Commands get `FAULT:NOT_HOMED`.
  - `homing_flaky`: the first end-of-cycle homing fails (`FAULT:HOMING_TIMEOUT`,
    then `STATUS:DONE` anyway), and the boot homing after the reset succeeds.
    This exercises decision 3 and the auto-clear.
- The existing `never_done`, `silent` and `disconnect` are kept.
  `never_done` now stops after `STATUS:MIX_DONE` and goes silent (a hang
  that isn't homing).
- The timing and back-off constants are imported from one table at the
  top, commented with their firmware `#define` names.

### `fake_dispense_bridge.py`

- `--telemetry-port 4246` and `--heartbeat-sec 10`: it sends `bridge_status`
  and, for each order it answers, a `dispense_cycle` with the synthetic
  stages (from `fake_arduino_serial.cycle_script`, scaled to `--delay`).
- `--homing-fault-sec N` (default 0 = off): after each `DONE` it reports
  `machine_fault HOMING_TIMEOUT` and rejects orders with `machine_fault` for
  N seconds, then `machine_ok`. Heartbeats reflect the fault. This is the
  Level 0 driver for TEL-06.

## Acceptance criteria

`tools/test_fakes.py`:
- [ ] `test_fake_arduino_cycle` (updated): the M5 line sequence, with total
      time still within ±1 % of the firmware estimate.
- [ ] `test_fake_arduino_homing_timeout`: boot → `FAULT:HOMING_TIMEOUT` at
      20 s scaled; `12` → `FAULT:NOT_HOMED`; retries at the back-off times.
- [ ] `test_fake_arduino_homing_flaky`: `12` → … `MIX_DONE`,
      `FAULT:HOMING_TIMEOUT`, `DONE`, reboot, `HOMING_DONE`.
- [ ] `test_fake_bridge_telemetry`: over real UDP, one `dispense_cycle`
      (valid JSON, stages in order) per order, and heartbeats at the
      interval.
- [ ] `test_fake_bridge_homing_fault_window`: `machine_fault`, then orders
      `REJECTED … machine_fault`, then `machine_ok` after N s.
- [ ] Automated Level 1 (real bridge + fake Arduino):
      - `test_level1_telemetry`: normal order → `DONE` on 4245 and a
        `dispense_cycle` on 4246 with all 7 cycle stages and `fault: null`;
      - `test_level1_homing_timeout`: at boot → `machine_fault`; `ORDER` →
        `REJECTED … machine_fault` with nothing written to serial;
      - `test_level1_homing_flaky`: `DONE` for the order, then
        `machine_fault`, then `machine_ok` after the reboot.
- [ ] All existing fake tests pass (updated for the new lines).

## Out of scope

Sensor faults (§3.9).
