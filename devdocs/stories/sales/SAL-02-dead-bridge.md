# SAL-02 — Dead bridge → out of service

**As a** customer, **I want** the machine to stop taking payments when the
hardware bridge isn't running, **so that** I'm never charged for a drink it
can't make. **As an** operator, **I want** it back in service by itself when
the bridge returns, and to see the outage in telemetry.

Plan refs: §3.10 (`BRIDGE_DOWN`), §0 decision (2026-09-24); README decisions
1, 8, 9.
Depends on: SAL-01 (local faults as a set). The heartbeat itself is TEL-03.

## Deliverables

```
autoload/TelemetryReporter.gd     # heartbeat watchdog
config/local_settings.json        # bridge.require_heartbeat, timing.bridge_heartbeat_timeout_sec, timing.bridge_startup_grace_sec
tools/dev_setup.gd                # dev override: bridge.require_heartbeat = false
config/local_settings.json        # messages.fault_bridge_down
tests/unit/test_dead_bridge.gd
```

## Spec

- **Watchdog in `TelemetryReporter`,** checked every frame against the wall
  clock (`Time.get_ticks_msec`):
  - `_started_msec`: set when the watchdog is (re)configured.
  - `_last_heartbeat_msec`: updated on every `bridge_status` datagram.
  - **Down** when `require_heartbeat` is on, `now − _started ≥ grace`, and
    `now − max(_last_heartbeat, _started) ≥ timeout`. On entering down:
    `ConfigManager.set_local_hardware_fault(true, "BRIDGE_DOWN")`, a
    `push_warning`, and `report_event({"event_type": "bridge_down",
    "silent_sec": …}, "app")`.
  - **Up** on the next heartbeat while down: clear `BRIDGE_DOWN` and report
    `bridge_up` (`down_sec`).
  - Only heartbeats count, not other 4246 events: the heartbeat is the
    bridge's promise to report every 10 s.
- **Settings:** `bridge.require_heartbeat` (default `true`),
  `timing.bridge_heartbeat_timeout_sec` (30), `timing.bridge_startup_grace_sec`
  (60). `configure_from_settings()` reads them. Tests can set the fields
  directly.
- **Dev default:** `tools/dev_setup.gd` (mock and razorpay-test modes)
  writes `"bridge": {"require_heartbeat": false}` into the override, and
  `dev_run.sh`'s banner shows `Bridge check: off (dev)` or `on`. README.md
  explains how to turn it on.
- **Message:** `fault_bridge_down`: "Hardware controller not responding".
- **Unchanged rules:** idle is the only enforcement point, and an order in
  progress finishes (or fails at its own safety cap) first.

## Acceptance criteria

`tests/unit/test_dead_bridge.gd` (the real `TelemetryReporter` on a free port,
queue under `user://test_dead/`, short timings: timeout 0.6 s, grace 0.3 s):
- [ ] `test_goes_down_without_heartbeat`: no datagrams → `BRIDGE_DOWN` after
      about max(grace, timeout); in maintenance; a `bridge_down` record
      queued with `source: app`.
- [ ] `test_not_before_grace`: grace 1.0, timeout 0.2 → not down at 0.8 s,
      down after 1.0 s.
- [ ] `test_heartbeats_keep_it_up`: heartbeats every 0.2 s for 1.5 s → never
      down.
- [ ] `test_recovers_on_heartbeat`: down, then one heartbeat → cleared, and a
      `bridge_up` record with `down_sec`.
- [ ] `test_disabled`: `require_heartbeat = false`, no datagrams for 1.5 s →
      never down.
- [ ] `test_overlaps_homing_fault`: down + a homing `machine_fault`; the
      heartbeat that ends the outage carries `machine_fault: HOMING_TIMEOUT`
      → `BRIDGE_DOWN` cleared, still in maintenance for homing.
- [ ] `test_non_heartbeat_events_dont_count`: only `dispense_cycle`
      datagrams → still goes down.
- [ ] `tools/dev_setup.gd` writes the setting (checked by reading the
      override in a test of dev_setup's JSON merge, or by hand in the SIGNOFF
      if the script isn't testable in-process).

## Out of scope

Restarting the bridge from the app (systemd `Restart=on-failure` is
Milestone 8).
