# Telemetry & machine faults — story set (Milestone 5)

Makes the machine report what it did and stop selling when it can't make
a drink. The firmware reports every dispense stage and bounds its homing
wait. The bridge turns that into one telemetry record per cycle, plus
machine-health events. The app queues and posts those records to the backend, and
a homing fault puts the machine into maintenance until the board homes
again.

- Plan: [greenfield-rewrite.md](../../plans/greenfield-rewrite.md) §3.8
  (telemetry), §3.10 (fault → screen mapping), §3.11 (maintenance), §5
  Milestone 5, §6 (rig levels), §7 step 11.
- Builds on: [dispensing set](../dispensing/README.md) (protocol v2,
  bridge, firmware, fakes) and the idle set's maintenance screen.
- Conventions, gotchas and test patterns: [CLAUDE.md](../../../CLAUDE.md).

## Goals

1. **Never sell into a broken machine.** Today, after a stuck homing, the
   next customer can pay and get the failure screen (the Milestone 4 open
   item). After this set, the machine goes to maintenance and the bridge
   refuses orders until the board homes again.
2. **Never hang the board.** `homeAxis()` gets a deadline.
3. **Know what happened.** One telemetry record per dispense cycle
   (ordered stages, fault, outcome), durable across offline periods, posted
   to the backend.
4. **Make the firmware testable.** It gets a host simulator, so behaviour,
   not just syntax, is verified before a board exists.

## Execution order

| # | Story | Depends on | Produces |
|---|-------|-----------|----------|
| 01 | [Firmware host simulator](TEL-01-firmware-host-sim.md) | — | runs `VM_code.ino` on the Mac with a simulated board; behavioural tests of the M4 firmware |
| 02 | [Firmware: stage lines + bounded homing](TEL-02-firmware-stages-homing.md) | 01 | `STATUS:<STAGE>` lines, `FAULT:HOMING_TIMEOUT`, homing retry with back-off, `FAULT:NOT_HOMED` |
| 03 | [Bridge: telemetry + machine health](TEL-03-bridge-telemetry.md) | 02 | per-cycle records, `machine_fault` / `machine_ok` / heartbeat on UDP 4246, orders refused while faulted |
| 04 | [Test-rig fakes](TEL-04-fakes.md) | 02, 03 | fake Arduino speaks the new lines, plus homing faults; fake bridge sends telemetry and heartbeats |
| 05 | [TelemetryReporter + report queue](TEL-05-telemetry-reporter.md) | 03 | `ReportQueue` (durable, retrying), `TelemetryReporter` autoload (4246 listener, enrich, POST), mock telemetry route |
| 06 | [Machine fault → maintenance](TEL-06-fault-maintenance.md) | 05 | homing fault flips the local fault flag, maintenance shows it, auto-clears on recovery |
| 07 | [End-to-end & sign-off](TEL-07-e2e-signoff.md) | 01–06 | simulator + Level 0 + Level 1 runs, SIGNOFF.md, plan / README / CLAUDE.md |

## Definition of Done (every story)

As in the dispensing set: `tools/run_tests.sh` → `ALL TESTS PASSED`,
`tools/check_boot.sh` → `BOOT OK`, and all Python tests → `OK`:
`python3 -m unittest mockserver/test_server.py hardware/bridge/test_udprxtx.py
tools/test_fakes.py hardware/firmware/test_firmware.py` (the files that
exist at that story). Also `tools/check_firmware.sh` when the sketch
changes. Timing-sensitive tests are re-run 2–3×. UI changes get a screenshot
that's actually looked at. One commit per story, `TEL-NN: <title>`, chained
with `&&` after the checks.

## Decisions

Made by the product owner (2026-09-24):

1. **Homing faults auto-clear, always.** The machine returns to service
   whenever the board next homes successfully (`STATUS:HOMING_DONE`),
   however often it has faulted. There's no latch and no technician step.
   Flapping stays visible to operations through the telemetry records.

Made while writing this set (verified by the spikes noted in each story):

2. **Firmware retries homing itself, with back-off, instead of resetting in
   a loop** (plan §3.8 said reset). On timeout the board stops the motor,
   prints `FAULT:HOMING_TIMEOUT` and stays up, *not homed*. It retries after
   1 min, then 2, 4 and 8, capped at **10 min** (product owner: the longest a
   repaired machine waits before retrying), and refuses commands meanwhile
   with `FAULT:NOT_HOMED`. A reset loop would drive the carriage into the
   hard stop for 20 s every ~20 s, forever. With back-off the motor runs 20
   s per attempt, and ever more rarely. Decision 1 still holds: a successful
   retry clears the fault.
3. **A homing failure at the end of a cycle doesn't fail the drink.** That
   homing happens after mixing, so the drink is complete. The firmware
   still prints `STATUS:DONE`, the customer sees "Enjoy your shake", and the
   machine goes to maintenance afterwards (idle is the enforcement point).
4. **The stage lines replace the free-text lines** (plan §3.8):
   `STATUS:BOOT`, `HOMING_START`, `HOMING_DONE`, `WATER_FILL_1_DONE`,
   `PROTEIN_DISPENSED <h>`, `WATER_FILL_2_DONE`, `MIX_DONE`, `DONE`. The
   bridge's recovery signal becomes `STATUS:HOMING_DONE`, and it still
   accepts the M4 `Home reached` so an old board works during the swap.
5. **UDP 4246 carries JSON events from the bridge**, one per datagram:
   `dispense_cycle`, `machine_fault`, `machine_ok` and a **`bridge_status`
   heartbeat every 10 s**. The heartbeat carries the current fault, so a
   lost `machine_ok` datagram, or an app restart, is corrected within 10 s.
   Heartbeats set the app's state but are **not** posted to the backend.
6. **The bridge refuses orders while the machine is faulted**
   (`REJECTED <id> machine_fault`). The app's maintenance screen normally
   keeps customers away, and this is defence in depth, independent of the
   app.
7. **`ReportQueue` is a shared helper** (`core/report_queue.gd`, `class_name
   ReportQueue`): a durable JSON queue (atomic writes, survives restarts),
   one POST in flight, retry on a timer, flush on boot. `TelemetryReporter`
   uses it now; Milestone 6's `SalesReporter` will reuse it. Records are
   removed on 2xx. A 4xx other than 408/429 is **dropped** with an error
   log, because a record the backend rejects would otherwise block the queue
   forever. The queue is capped at **5 000** records (~3.5 MB, weeks of
   offline running), oldest dropped first with a warning. The plan said
   "never dropped"; an unbounded file on an SD card is worse.
8. **Endpoint and settings, not constants:** `local_settings.api.telemetry_path`
   (`/telemetry`, on `api.base_url`), `bridge.telemetry_port` (4246),
   `timing.telemetry_retry_interval_sec` (60). This follows the M1 URL
   decision; the plan's `const TELEMETRY_REPORT_URL` is dropped.
9. **The app stamps the context the bridge can't know.** `event_id` (ULID, the
   backend's dedupe key), `tenant_id`, a UTC `timestamp` (Godot's
   `get_datetime_string_from_system(true)` has **no `Z`**, so the reporter
   appends it; spiked), and for a cycle, `transaction_id`, `flavor_id`,
   `base_id`, `order_number` from an **order context** that `Bridge` records
   when it sends the order. This beats reading `OrderState`, which may
   already have been reset.
10. **The app reports the case the bridge can't:** when the dispensing
    screen hits its safety cap with no bridge reply, it records a
    `dispense_cycle` with `source: "app"`, `result: "NO_RESPONSE"`.
11. **Firmware host simulator** (`hardware/firmware/host_sim/`): the sketch
    is compiled with `clang++` inside a `struct Board` (fresh RAM per boot,
    like a real reset) against a simulated board. It has a virtual clock,
    carriage position from step pulses, a limit switch that can be broken,
    serial in/out, and the watchdog reset as a C++ exception. It isn't an AVR
    emulator: timing is `delay()` arithmetic, and registers and interrupts
    aren't modelled. Level 2 remains the real check.

Deviations from the plan text: decision 2 (no reset loop), 7 (queue cap,
dropping 4xx), 8 (settings instead of consts), 5 (heartbeat events, the
`bridge_status` type).

## Telemetry events (bridge → app, UDP 4246, JSON)

| `event_type` | When | Fields (besides `event_type`, `v: 1`) | Posted? |
|---|---|---|---|
| `dispense_cycle` | an order ends (DONE, TIMEOUT or REJECTED) | `order_id`, `hopper`, `base`, `result`, `reason`, `stages: [{stage, t_offset_ms}]`, `fault` (null or code), `duration_ms` | yes |
| `machine_fault` | `FAULT:HOMING_TIMEOUT` seen (first after OK) | `fault`, `order_id` (null outside a cycle) | yes |
| `machine_ok` | `STATUS:HOMING_DONE` after a fault | `cleared` (the code) | yes |
| `bridge_status` | every 10 s | `state`, `serial` (bool), `machine_fault` (null or code), `uptime_s` | no (state only) |

The app adds `event_id`, `tenant_id`, `timestamp` (UTC, `Z`) and `source`
(`bridge`/`app`), plus the order context for `dispense_cycle`. The example
payload is in TEL-05.

## Firmware serial lines after this set

| Line | Meaning |
|------|---------|
| `STATUS:BOOT` | `setup()` started (after power-on or a watchdog reset) |
| `STATUS:HOMING_START` / `STATUS:HOMING_DONE` | homing began / the limit switch was reached |
| `STATUS:WATER_FILL_1_DONE`, `STATUS:PROTEIN_DISPENSED <h>`, `STATUS:WATER_FILL_2_DONE`, `STATUS:MIX_DONE` | cycle stages, in order |
| `STATUS:DONE` | the cycle is complete, right before the reset |
| `FAULT:HOMING_TIMEOUT` | no limit switch within 20 s; the motor is stopped; not homed |
| `FAULT:NOT_HOMED` | a command arrived while not homed; nothing moves |
| `FAULT:HOPPER_UNASSIGNED <h>` / `FAULT:BAD_COMMAND` | unchanged from M4 |

## Out of scope

- Sensor-based faults (§3.9: cup, leak, door, stall, weight) and a
  watchdog-loop detector.
- Sale reporting (**Milestone 6**, which reuses `ReportQueue`).
- Detecting a **dead bridge** (no heartbeat) and putting the machine into
  maintenance for it. This set makes it detectable (heartbeat) but doesn't
  act on it; that's an open product question.
- A telemetry backend and dashboard. The mock server stands in, and the real
  endpoint is a settings change.
- Level 2/3 hardware runs (written up as pending steps).
