# DSP-04 — Test-rig fakes: Level 0 bridge and Level 1 Arduino

**As a** developer without the machine, **I want** a fake bridge (for the
app) and a fake Arduino (for the real bridge), **so that** the whole
dispensing flow, including its failure paths, can be exercised on a laptop.

Plan refs: §6 Levels 0 and 1; README decisions 4, 8, 9, 10 and the protocol
table.
Depends on: DSP-02 (the bridge and its parser), DSP-03 (the firmware
behaviour the fake mirrors).

## Verified before writing (spike, 2026-09-24)

- `socat` isn't installed. `pty.openpty()` gives a pair whose slave path
  (`os.ttyname`, e.g. `/dev/ttys000`) opens by path like a serial device.
  That's enough for Level 1, so the fake Arduino owns the PTY and prints the
  path.
- Firmware cycle timings per hopper (README decision 8) drive the fake's
  default delays.

## Deliverables

```
tools/fake_dispense_bridge.py     # Level 0: stands in for udprxtx.py
tools/fake_arduino_serial.py      # Level 1: stands in for the Mega, over a PTY
tools/test_fakes.py               # unittest for both, plus the automated Level 1 test
```

Both are stdlib only. They reuse `hardware/bridge/udprxtx.py`'s parser and
constants by path import, so the protocol lives in one place.

## Spec

### `tools/fake_dispense_bridge.py` (Level 0)

```
python3 tools/fake_dispense_bridge.py [--mode done|timeout|reject|silent] [--delay 8]
    [--listen-host 127.0.0.1] [--order-port 4242] [--app-host 127.0.0.1] [--result-port 4245]
```

- Binds the order port like the real bridge (so it can't run alongside
  `udprxtx.py` or `udp_monitor.py`).
- On a valid `ORDER`: logs it, then after `--delay` seconds replies:
  `done` → `DONE <id>`; `timeout` → `TIMEOUT <id> deadline`; `reject` →
  `REJECTED <id> busy` (immediately, ignoring the delay); `silent` → nothing
  (this exercises the app's safety cap). Replies are scheduled, not slept,
  so the fake keeps receiving.
- An `ORDER` with a valid ID but a bad body → `REJECTED <id> bad_order`.
  `CANCEL` → logged. Anything else → logged as ignored.
- `FakeBridge` class with `handle(text, now)` and `due(now)` for unit tests;
  `main()` is the socket loop.

### `tools/fake_arduino_serial.py` (Level 1)

```
python3 tools/fake_arduino_serial.py [--time-scale 1.0] [--fault none|never_done|silent|disconnect]
    [--assigned 1,2,3,4] [--link /tmp/fuelbot-arduino]
```

- Opens a PTY pair and prints `SERIAL <slave path>` as its first line.
  `--link` also symlinks a stable path to the slave, for `udprxtx.py
  --serial /tmp/fuelbot-arduino`.
- Behaves like `VM_code.ino` after DSP-03. At start it prints the boot
  banner (` `, `Reset!`, `Homing`, `Home reached`). It reads
  `"<h><b>\n"`, validates like the firmware (`FAULT:HOPPER_UNASSIGNED <h>`
  for a hopper not in `--assigned`, `FAULT:BAD_COMMAND` otherwise), then
  prints the cycle's lines at firmware-derived times × `--time-scale`:
  `Water Filled in Cup`, `Protein <h> Dispensed`, `Water Filled in Cup`,
  `Shake Frothing Done`, `Homing`, `Home reached`, `Mix Done`,
  `STATUS:DONE`. Then it "resets": ` `, `Reset!`, `Homing`, `Home reached`.
  At scale 1.0 the cycle takes 68–78 s depending on hopper (decision 8).
- Faults: `never_done` runs the cycle but stops after
  `Shake Frothing Done`/`Homing` (a stuck `homeAxis()`) and never prints
  `STATUS:DONE`; `silent` reads commands and prints nothing; `disconnect`
  closes the PTY halfway through the cycle.
- Commands that arrive during a cycle are **dropped** (logged to stderr), as
  on the real board: `loop()` is blocked in `delay()`s, and the watchdog
  reset at the end of the cycle clears the UART buffer. The bridge never
  sends one then, because it waits for `DONE` plus recovery.
- `FakeArduino` class with `feed(bytes)` and `due(now) -> list[str]` for
  unit tests; `main()` is the PTY loop.

## Acceptance criteria

`tools/test_fakes.py` (`python3 -m unittest tools/test_fakes.py`):
- [ ] `test_fake_bridge_modes`: done/timeout/silent/reject reply as
      specified, at `delay` (done/timeout) and immediately (reject); bad
      body → `REJECTED bad_order`; CANCEL → no reply.
- [ ] `test_fake_arduino_cycle`: `12` → the line sequence ending
      `Mix Done`, `STATUS:DONE`, then the reset banner, with total scaled
      time within ±1 % of the firmware estimate for hopper 1.
- [ ] `test_fake_arduino_validation`: `52` (default assigned 1–4) →
      `FAULT:HOPPER_UNASSIGNED 5`; `72`, `13`, `ab` → `FAULT:BAD_COMMAND`;
      no cycle lines. With `--assigned 1,2,3,4,5`, `52` runs a cycle.
- [ ] `test_fake_arduino_faults`: `never_done` → no `STATUS:DONE` ever;
      `silent` → no output.
- [ ] **Level 1, automated** (`test_level1_*`): the real
      `udprxtx.run()` in a thread, `--serial` = the fake's PTY, fake time
      scale 0.02, ephemeral UDP ports:
      - `ORDER` → `DONE <id>` on the result socket, and the fake received
        exactly `12\n`;
      - `never_done` with bridge deadline 2 s → `TIMEOUT <id> deadline`;
      - hopper 5 → `TIMEOUT <id> fault:HOPPER_UNASSIGNED`;
      - `disconnect` → `TIMEOUT <id> serial_lost`.
- [ ] `--help` works for both scripts, and they import only the standard
      library plus `udprxtx`.

## Out of scope

The Level 0 telemetry record on 4246 and the `--fault homing_timeout` stage
semantics (Milestone 5).
