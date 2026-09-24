# Telemetry & machine faults (Milestone 5) — sign-off (TEL-07)

Executed 2026-09-24 on macOS (Apple M5), Godot 4.7.2.stable.official, Python
3.9.6, clang++ (Apple), branch `milestone-5-telemetry` (off
`milestone-4-dispensing`). Evidence is in `.screenshots/tel-e2e/`
(gitignored): walker screenshots `<flow>-NN-<scene>.png`, plus
`app-<flow>.log`, `bridge-<flow>.log`, `arduino-<flow>.log`, `mock.log` and
the simulator outputs `sim-*.txt`.

The runs used their own ports (mock :8790; bridge 5242/5245/5246, via a
temporary settings override that was restored afterwards), because the
product owner's own dev session held 4242/4245/8787.

**Status: firmware simulator PASS, Level 0 PASS, Level 1 PASS. Level 2/3 are
pending hardware.**

## Automated

| Check | Result | Evidence |
|-------|--------|----------|
| `tools/run_tests.sh` | PASS | `ALL TESTS PASSED (162)` (140 → 162: report queue 8, telemetry reporter 6, fault → maintenance 7, config 1). The telemetry, report-queue, fault, payment and dispensing filters re-run with no flakes |
| `python3 -m unittest hardware/firmware/test_firmware.py` | PASS | `Ran 9 tests … OK`, 3× (~1.5 s; it builds the simulator itself) |
| `python3 -m unittest hardware/bridge/test_udprxtx.py` | PASS | `Ran 24 tests … OK`, 3× |
| `python3 -m unittest tools/test_fakes.py` | PASS | `Ran 21 tests … OK`, 3×. Includes automated Level 1: telemetry, homing timeout, homing flaky |
| `python3 -m unittest mockserver/test_server.py` | PASS | `Ran 17 tests … OK` (the telemetry route) |
| `tools/check_boot.sh` | PASS | `BOOT OK` |
| `tools/check_firmware.sh` | PASS | `FIRMWARE SYNTAX OK (simulator builds)` |

## Firmware on the host simulator (TEL-01/02)

The real `VM_code.ino` on the simulated board (`sim-*.txt`):

| Scenario | Result |
|----------|--------|
| Normal cycle | `STATUS:BOOT`, `HOMING_START`, `HOMING_DONE` (3.0 s from 30 000 steps); `12` → the 7 stage lines in order, `STATUS:DONE` at 75.2 s, watchdog reset, clean boot, no second cycle. Only M1 and the pump were driven |
| Broken switch 0–150 s, orders at 150 s and 300 s | `FAULT:HOMING_TIMEOUT` at 20.0 s, **no reset loop**; retry at 80 s fails (100 s); order at 150 s → `FAULT:NOT_HOMED`, nothing moves; retry at 220 s → `STATUS:HOMING_DONE`; the order at 300 s runs a full cycle |
| Back-off (switch broken for good) | attempts at 0, 80, 220, 480, 980, 1600, 2220 s (gaps 60 → 120 → 240 → 480 → **600 capped**) |
| Switch fails only at the end-of-cycle homing | `MIX_DONE`, `HOMING_START`, `FAULT:HOMING_TIMEOUT`, **`STATUS:DONE`** (the drink is kept), reset, and the boot homing succeeds |
| M4 behaviours | `52`/`62` → `FAULT:HOPPER_UNASSIGNED`, `72`/`13`/`ab` → `FAULT:BAD_COMMAND`, with no pin driven; each hopper drives only its own motor |

## Level 0 — app + mock (:8790) + `fake_dispense_bridge.py`

| Flow | Fake bridge | Result |
|------|-------------|--------|
| **telemetry** | `--mode done --delay 4` | PASS. DONE at +4 s. **Exactly 1** telemetry POST (the heartbeats over 36 s were not posted): `dispense_cycle`, `result DONE`, `fault null`, `source bridge`, `transaction_id pay_MockPay0000001`, `timestamp …Z`, 7 stages in order |
| **fault → maintenance → auto-clear** | `--homing-fault-sec 20` | PASS. The fault arrived during "Enjoy your shake" (not interrupted, `maintenance=true`); the return to idle **redirected to Maintenance** (t 19.6 s), which showed `HOMING_TIMEOUT · Carriage did not reach its home position` and "flagged at … 6 s ago"; `machine_ok` 20 s after the fault → **back to attract by itself** (t 33.3 s). 3 POSTs: `dispense_cycle`, `machine_fault`, `machine_ok` |
| **offline queue** | telemetry route `server_error`, then `default` at 22 s | PASS. At 22 s the record was in `user://telemetry_queue.json` (1 record); it was retried 4× (500), then **delivered once** (one 201); queue `[]` afterwards |
| **no bridge reply** | `--mode silent`, cap 15 s | PASS. FAILED at the cap (+15.0 s); one `dispense_cycle` posted by the app: `result NO_RESPONSE`, `reason safety_cap`, `source app`, the order's `transaction_id`, `duration_ms 15007` |

## Level 1 — app + real `udprxtx.py` + `fake_arduino_serial.py` (×0.1)

| Flow | Fake Arduino | Result |
|------|--------------|--------|
| **normal** | default | PASS. Bridge: `12` → `STATUS:DONE` in 7.28 s → DONE; app DONE → attract. The posted record has the **real measured offsets**: water 788 ms, protein 1 228, water 2 219, mix 5 835, homing 7 227, done 7 283 |
| **homing flaky** | `--fault homing_flaky` | PASS. The final homing failed (`FAULT:HOMING_TIMEOUT`), `STATUS:DONE` followed → DONE for the customer; the reboot homing succeeded 0.1 s later → `machine_ok`, *before* the done screen ended, so the maintenance screen never showed. That's correct for a one-off glitch. 3 events posted |
| **homing broken** | `--fault homing_timeout`, no order | PASS. The app was on **Maintenance** from the start (t 3.0 s); board retries faulted at 0 / 8 / 22 s (the back-off at 0.1×); **one** `machine_fault` posted (one per outage). A direct `ORDER` → **`REJECTED … machine_fault`**, 0 commands written to the board |

## Issues found and fixed during execution

1. **Simulator: `--until` couldn't interrupt a busy-wait.** The M4 homing
   loop never returns, so the simulator ran until the broken-switch window
   ended (20 s real time) and "homed". The virtual clock now enforces the
   stop point itself (TEL-01).
2. **Simulator: reset semantics.** Re-running `setup()` kept RAM, so the
   cycle ran twice. The sketch is compiled as `struct Board`, with a fresh
   instance per boot (found in the spike).
3. **New `class_name` + `check_boot.sh`:** "script does not inherit from
   Node" for `TelemetryReporter` until `godot --headless --import`
   refreshed the class cache. `run_tests.sh` imports first; `check_boot.sh`
   doesn't.
4. **`ConfigManager` test instance** (`auto_boot = false`) has no messages
   until `_load_local_settings()`, which the fault-description test now
   calls.
5. **Maintenance diagnostics** showed "flagged at —" for local faults. The
   fault's start time is now recorded and shown ("21:55 IST · 6 s ago").
6. Test-harness only: a walker script's bare `wait` waited on the long-running
   bridge; two direct-ORDER checks used a 24-character ID (the bridge rightly
   ignored them) and were redone with a real ULID.

## Observations (not fixed; for review)

- **Homing past the switch.** With a broken switch the simulated carriage
  drives on to the hard stop (500 steps past home in the model). The first
  successful homing then calls that spot 0. The M4 firmware homes the same
  way (it stops at the first switch reading). Check the real rail geometry
  at Level 2; a back-off-and-re-approach homing would remove any offset.
- **Maintenance footer copy** says "EXIT VIA REMOTE CONSOLE ONLY", which isn't
  true for a local fault that clears itself.
- **Flaky switch that recovers on reboot:** the customer never sees
  maintenance and the machine keeps selling. That's by design (decision 1),
  and ops see `machine_fault` / `machine_ok` pairs in telemetry.

## Level 2 / Level 3 — pending hardware

**Level 2 (real Mega, LEDs):**
1. Flash `hardware/firmware/VM_code.ino` (see the dispensing SIGNOFF for
   `arduino-cli`). This is also the first real AVR compile of the M5 changes.
2. Serial monitor, 9600: `STATUS:BOOT`, `STATUS:HOMING_START`, then press the
   switch → `STATUS:HOMING_DONE`.
3. `12` → the 7 `STATUS:` lines, in order; time the cycle.
4. **Unplug the limit switch** and reset: `FAULT:HOMING_TIMEOUT` after 20 s,
   and the ENA LED (motor enable) off. `12` → `FAULT:NOT_HOMED`, no LED.
   Retries at +60 s, then +120 s.
5. Plug it back in → the next retry prints `STATUS:HOMING_DONE`, and `12`
   works.
6. With `udprxtx.py` and the app: step 4 puts the app on the maintenance
   screen within 10 s; step 5 brings it back by itself; the telemetry
   backend (or the mock) receives `machine_fault` and `machine_ok`.
7. Check the carriage position after a failed-then-recovered homing (see
   Observations).

**Level 3 (bench):** compare the real stage offsets in the posted records
with the simulator and fake timings. Retune `dispense_expected_sec`,
`--deadline` and the safety cap (dispensing README decision 8).

## Open items

- **Dead bridge:** a missing heartbeat is now detectable, but it doesn't put
  the machine into maintenance (a product decision).
- **Maintenance footer copy** for local faults.
- **Telemetry backend:** the real endpoint (`api.telemetry_path` on
  `api.base_url`) and its auth beyond `X-Tenant-Id`.
- Carried over: motors 5–6 wiring, refund policy, Level 2/3 runs,
  Milestone 2 Part B, porting `pinelabs.py`.
