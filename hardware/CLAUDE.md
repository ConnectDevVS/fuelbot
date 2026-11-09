# hardware/CLAUDE.md

Rules for the machine side: the Arduino Mega firmware, the Pi-side bridge
between the app (UDP) and the board (serial), and the fakes that stand in
for both. **Commands run from the repo root.** The app side of the protocol
(the `Bridge` and `TelemetryReporter` autoloads, the dispensing screen) is in
[kiosk/CLAUDE.md](../kiosk/CLAUDE.md); repo-wide rules in the root
[CLAUDE.md](../CLAUDE.md). How to run things: [README.md](README.md).

## Layout

```
firmware/      VM_code.ino (the sketch), host_sim/ (simulator: Arduino.h + sim.cpp),
               test_firmware.py (behavioural tests on the simulator)
bridge/        udprxtx.py (protocol v2, stdlib only) + test_udprxtx.py
tools/         fake_dispense_bridge.py (Level 0), fake_arduino_serial.py (Level 1),
               udp_monitor.py (prints app→bridge UDP on 4242), check_firmware.sh,
               test_fakes.py (incl. automated Level 1)
```

Protocol and decisions:
[dispensing README](../docs/stories/dispensing/README.md) (orders and
results), [telemetry README](../docs/stories/telemetry/README.md) (the
`STATUS:`/`FAULT:` table, 4246 events, machine faults).

## Commands (run from the repo root)

- `python3 -m unittest hardware/bridge/test_udprxtx.py hardware/tools/test_fakes.py hardware/firmware/test_firmware.py`:
  the bridge, the fakes + automated Level 1, and the **firmware on the host
  simulator** (needs clang++).
- `hardware/tools/check_firmware.sh`: `clang++ -fsyntax-only` of the sketch
  and a build of the simulator (`hardware/firmware/host_sim/`). Not an AVR
  compile (`arduino-cli` isn't installed).
- Firmware simulator by hand: build `hardware/firmware/host_sim/sim.cpp` (see
  `test_firmware.py`), then `sim [--start-pos N] [--broken-limit FROM:TO]
  [--at T:LINE] [--until S]` prints `<t>\t<serial line>`.
- `python3 hardware/tools/fake_dispense_bridge.py --mode done|timeout|reject|silent --delay N
  [--homing-fault-sec N]`: Level 0 stand-in for the bridge (also sends 4246
  telemetry and heartbeats).
- Level 1, the real bridge with a fake Arduino:
  `python3 hardware/tools/fake_arduino_serial.py --time-scale 0.1 --link <path>
  [--fault never_done|silent|disconnect|homing_timeout|homing_flaky]` +
  `python3 hardware/bridge/udprxtx.py --serial <path> --recover-sec 3`.
- `python3 hardware/tools/udp_monitor.py`: see exactly what the app sends the
  bridge (4242). It can't run alongside the real or fake bridge (port
  conflict), and it can't watch 4245 while the app runs (the app binds it).

## Definition of done

The Python tests above → `OK` when any of them or the code they cover
changed; `hardware/tools/check_firmware.sh` when the sketch changed. A change
the app sees (protocol, events) also runs the kiosk checks
(`kiosk/tools/run_tests.sh && kiosk/tools/check_boot.sh`).

## Rules

- **One bridge.** Only one process can bind 4242: the real bridge, the fake
  bridge or `udp_monitor.py`, never two at once. Results go to the app on
  4245, telemetry on 4246.
- The bridge is stdlib-only Python 3.9 (no `match`, no `X | Y` hints). All
  policy lives in `BridgeCore` (no I/O, fake clock in tests). It rejects
  orders while dispensing, recovering (after each cycle until
  `STATUS:HOMING_DONE`, max `--recover-sec`) or faulted
  (`REJECTED machine_fault`), and never blocks without a deadline.
- Firmware changes are minimal and marked `// M4:` / `// M5:`. Every serial
  line is `STATUS:<STAGE>` or `FAULT:<CODE>` (table in the telemetry
  README); keep them exact, since the bridge and fakes match them. Hoppers
  5–6 are `-1` placeholders that fail safe. **Change firmware only with a
  simulator test** (`hardware/firmware/test_firmware.py`).
- The board never resets in a loop on a homing fault: it retries after 1,
  2, 4 and 8 min, then every 10 min, and refuses commands (`FAULT:NOT_HOMED`).
  A homing failure after mixing still ends in `STATUS:DONE` (the drink
  counts).
- Timing chain: firmware cycle ≈ 68–78 s < bridge `--deadline` 110 < app
  cap (`timing.dispense_safety_cap_sec`) 130. Keep cap > deadline if you
  retune.
- The fakes speak the same lines and events as the real thing; a protocol
  change updates the fakes and `test_fakes.py` in the same commit.

## Gotchas

- **Firmware simulator:** the sketch is compiled as `struct Board { #include
  VM_code.ino }`, with a fresh `Board` per boot, because re-running `setup()`
  keeps RAM and a cycle repeats. The stop time (`--until`) is enforced inside
  `delay()`, since a busy-wait never returns to the driver.
- `socat`, `pyserial` and `arduino-cli` aren't installed. Serial fakes use
  Python `pty` pairs. **PTY gotcha:** with `O_NONBLOCK` and `VMIN=0`, macOS
  returns `b''` for "no data", which looks like EOF. Use `VMIN=1` (EAGAIN =
  no data, `b''` = closed). Keep the fake's slave fd open and raw, or the
  pty echoes the fake's own output back to it.

## Open items

- **Motors 5–6 wiring:** `hardware/firmware/VM_code.ino` has `-1`
  placeholder pins, positions and durations (`TODO(wiring)`). Until they're
  wired, a real machine's catalog must not enable flavors on hoppers 5–6.
- **Milestone 4 Levels 2/3 pending hardware** (steps in the dispensing
  SIGNOFF), including the first real AVR compile. Then retune the timing
  chain from measured cycles.
- **Milestone 5 Levels 2/3 pending hardware** (steps in the telemetry
  SIGNOFF): unplug the limit switch, watch the fault, retries and auto-clear.
- **Homing past the switch:** after a broken-switch fault the carriage can sit
  beyond home, and the next successful homing zeroes there (M4 homing
  behaviour). Check at Level 2.
