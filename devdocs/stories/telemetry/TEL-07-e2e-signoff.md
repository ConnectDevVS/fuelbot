# TEL-07 — End-to-end verification and sign-off

**As the** product owner, **I want** evidence that telemetry reaches the
backend and that a homing fault takes the machine out of service and back,
**so that** Milestone 5 can be called done in software, with the hardware
checks written down.

Plan refs: §5 Milestone 5 (verify), §6, §7 step 11.
Depends on: TEL-01 … TEL-06.

## Deliverables

```
devdocs/stories/telemetry/SIGNOFF.md
devdocs/plans/greenfield-rewrite.md   # §0 log + status, §3.8, §3.10, §4, §5 (M5), §6, §7 step 11 notes
README.md                             # telemetry, the simulator, the new fake options
CLAUDE.md                             # new rules, commands, gotchas; the M4 "stuck board" open item closed
```

Walker scenes and captures stay uncommitted (`tmp_capture/`,
`.screenshots/tel-e2e/`).

## Spec

### Firmware simulator (the "Level ½" run, recorded)

The TEL-02 scenarios run from the command line, with their outputs kept as
evidence: a normal cycle, homing timeout at boot plus back-off, auto
recovery, and a homing failure at the end of a cycle.

### Level 0: app + mock (payments `paid_after_3`, telemetry `default`) + `fake_dispense_bridge.py`

| Flow | Fake bridge | Expected |
|------|-------------|----------|
| telemetry | `--mode done --delay 4` | order done; the mock receives exactly one telemetry POST for it (`request_counts`), and `last_body` has the order's ULID, `transaction_id`, 7 stages and `fault: null`; heartbeats are not posted |
| fault → maintenance → auto-clear | `--mode done --delay 4 --homing-fault-sec 20` | "Enjoy your shake" (the order isn't interrupted) → attract → **maintenance** screen showing `HOMING_TIMEOUT` → after ~20 s back to attract; the mock got `dispense_cycle`, `machine_fault`, `machine_ok` |
| offline queue | the telemetry route on `server_error` during an order, then `default` | the record is kept in `user://telemetry_queue.json`; after the switch, posted once; the queue is empty |
| no bridge reply | `--mode silent`, safety cap lowered | FAILED at the cap, and one `NO_RESPONSE` record posted with `source: app` |

### Level 1: app + real bridge + `fake_arduino_serial.py`

| Flow | Fake Arduino | Expected |
|------|--------------|----------|
| normal | default, `--time-scale 0.1` | a DONE order; the posted record has the bridge's real stage offsets |
| homing flaky | `--fault homing_flaky` | the order DONE for the customer; then maintenance; back to attract once the reboot homing succeeds |
| homing broken | `--fault homing_timeout` | the app goes to maintenance within 10 s of startup (heartbeat); an order can't be started from attract (the maintenance screen is shown); a direct UDP `ORDER` gets `REJECTED … machine_fault` |

### Level 2 / 3 (pending hardware, exact steps in SIGNOFF)

Flash; watch the `STATUS:*` lines; unplug the limit switch → at boot,
`FAULT:HOMING_TIMEOUT` after 20 s with the motor stopped, then retries at
+60 / +120 s; plug it back in → `STATUS:HOMING_DONE` at the next retry, and
the app leaves maintenance. Level 3: compare the real stage offsets with the
simulator's.

## Acceptance criteria

- [ ] SIGNOFF.md: automated results (all suites with counts), the
      simulator run, the Level 0 table (4 flows), the Level 1 table (3
      flows), screenshots (maintenance with the local fault, done), issues
      found and fixed, the Level 2/3 checklist, open items (dead bridge,
      motors 5–6, refunds, Level 2/3, Milestone 2 Part B).
- [ ] Plan §0: decisions logged; §3.8 and §3.10 rewritten to match what was
      built; §4 adds `core/`, `TelemetryReporter`, `host_sim/`; §5
      Milestone 5 status.
- [ ] README.md and CLAUDE.md updated; CLAUDE.md's "stuck board" open item
      resolved.
- [ ] Tree clean, and no stray processes (mock, fakes, bridge, monitor,
      walkers).

## Out of scope

Running Levels 2/3; a real telemetry backend.
