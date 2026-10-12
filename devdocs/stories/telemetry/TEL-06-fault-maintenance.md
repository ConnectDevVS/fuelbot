# TEL-06 — Machine fault → maintenance, auto-clear on recovery

**As a** customer, **I want** the machine to show "out of service" when it
can't make a drink, **so that** I never pay for a drink it can't make. **As
an** operator, **I want** it back in service by itself once the board homes
again.

Plan refs: §3.10 (Bucket C, the local fault flag), §3.11 (maintenance, idle
as the only enforcement point); README decisions 1, 3, 5.
Depends on: TEL-05 (`TelemetryReporter` receives the events).

## Deliverables

```
autoload/TelemetryReporter.gd          # _apply_health()
autoload/ConfigManager.gd              # set_local_hardware_fault(active, code := ""); local faults in get_maintenance_info()
config/local_settings.json             # messages: fault_homing_timeout (+ fault_unknown)
tests/unit/test_fault_maintenance.gd
tests/unit/test_config_manager.gd      # local fault code in get_maintenance_info
```

## Spec

- **`_apply_health(fault: Variant)`**, called for `machine_fault`
  (`fault` = the code), `machine_ok` (null) and every `bridge_status`
  (its `machine_fault`):
  - a code that's in `LOCAL_MAINTENANCE_FAULTS` (`["HOMING_TIMEOUT"]`, the
    Bucket C list) → `ConfigManager.set_local_hardware_fault(true, code)`;
  - null → `set_local_hardware_fault(false)`;
  - any other code → logged only (not Bucket C).
  - It only calls `ConfigManager` when the value changes, so heartbeats don't
    cause churn. `ConfigManager` already emits `maintenance_changed` only
    on change.
- **`ConfigManager.set_local_hardware_fault(active, code := "")`** stores the
  code. When the local source is active, `get_maintenance_info()` returns
  `faults: [{"code": code, "description":
  get_message("fault_" + code.to_lower())}]`, falling back to
  `fault_unknown` if there's no such message key. The maintenance screen
  already renders `code · description` in its faults panel, so it needs no
  change.
- **Messages:** `fault_homing_timeout`: "Carriage did not reach its home
  position"; `fault_unknown`: "Hardware fault".
- **Behaviour** (existing, unchanged, now exercised): idle redirects to
  maintenance when `is_in_maintenance()`. An order in progress is never
  interrupted; the machine goes to maintenance after the order returns to
  idle. The maintenance screen goes back to idle when the flag clears.
- **Remote and local together:** remote maintenance still wins the message
  and diagnostics (existing rule). Clearing the local fault while remote is
  on keeps the machine in maintenance.

## Acceptance criteria

`test_fault_maintenance.gd` (real autoloads, snapshot/restore, `Nav.dry_run`,
`TelemetryReporter` listening on a free port, events sent as UDP JSON):
- [ ] `test_machine_fault_enters_maintenance`: on idle, `machine_fault
      HOMING_TIMEOUT` → `is_in_maintenance()`, and idle requests
      `MAINTENANCE`.
- [ ] `test_maintenance_shows_fault`: the maintenance screen's fault lines =
      `["HOMING_TIMEOUT · Carriage did not reach its home position"]`, and
      `flagged_by` = the local-fault text.
- [ ] `test_machine_ok_clears`: on the maintenance screen, `machine_ok` →
      the screen requests `IDLE` (auto-clear, decision 1).
- [ ] `test_heartbeat_reconciles`: set the fault, then only a
      `bridge_status` with `machine_fault: null` (the `machine_ok` "lost")
      → cleared. A heartbeat with `HOMING_TIMEOUT` after an app restart
      (fresh flag) → set.
- [ ] `test_mid_order_not_interrupted`: on the dispensing screen (BLENDING),
      `machine_fault` → no navigation, still BLENDING; after `DONE` and the
      return, `Nav.go_idle()`, then idle → maintenance.
- [ ] `test_non_bucket_c_fault_ignored`: `machine_fault
      HOPPER_UNASSIGNED` → not in maintenance.
- [ ] `test_remote_wins`: remote on + local fault, then local clears →
      still in maintenance, with the remote message.
- [ ] Screenshot of the maintenance screen with the local fault
      (`.screenshots/Maintenance-local-fault.png`), looked at against PDF
      page 6.

## Out of scope

Dead-bridge → maintenance (an open question); technician acknowledgement;
fault latching (decision 1 says auto, always).
