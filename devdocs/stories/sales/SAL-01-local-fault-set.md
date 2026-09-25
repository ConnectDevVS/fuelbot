# SAL-01 — Local faults as a set, maintenance copy for self-clearing faults

**As the** machine, **I want** to track each local fault on its own, **so
that** a homing fault and a dead bridge can overlap and clearing one never
puts a still-broken machine back into service. **As a** customer or
technician, **I want** the maintenance screen to say the machine comes back by
itself when that's true.

Plan refs: §3.10 (local fault flag, now plural), §3.11; README decisions 6
and 7.
Depends on: the telemetry set (`TelemetryReporter._apply_health`).

## Deliverables

```
autoload/ConfigManager.gd          # local_faults: {code: since}; set_local_hardware_fault(active, code)
autoload/TelemetryReporter.gd      # _apply_health clears only its own code
scenes/maintenance/maintenance.gd  # footer: local vs remote hint
config/local_settings.json         # maintenance_exit_hint_local
tests/test_case.gd                 # snapshot/restore local_faults
tests/unit/test_config_manager.gd, test_fault_maintenance.gd, test_maintenance_screen.gd
```

## Spec

- `ConfigManager.local_faults: Dictionary` maps code → the UTC ISO time it
  was first set. `local_hardware_fault_active` stays as a read-only
  convenience (`not local_faults.is_empty()`), because existing code and
  tests read it. The single `local_hardware_fault_code` /
  `local_hardware_fault_since` fields are removed.
- `set_local_hardware_fault(active: bool, code := "")`:
  - `true` + code: add it (the time is kept if already present);
  - `false` + code: remove only that code;
  - `false` and no code: clear all of them;
  - `true` with no code: an anonymous fault (key `""`), counted but not
    listed (the existing behaviour).
  - It emits `maintenance_changed` only when `is_in_maintenance()` or the
    message actually changes (existing rule).
- `get_maintenance_info()` (local source): `faults` lists every active code
  with its description (the existing `fault_<code>` lookup with the
  `fault_unknown` fallback), oldest first. `flagged_at` is the oldest fault's
  time.
- `TelemetryReporter._apply_health` sets and clears **only** `HOMING_TIMEOUT`.
- **Maintenance footer:** `maintenance_exit_hint_local` when the source is
  local, `maintenance_exit_hint` when remote. Remote wins when both apply
  (existing rule).

## Acceptance criteria

- [ ] `test_config_manager.gd::test_local_faults_are_a_set`: set HOMING, set
      BRIDGE → two faults, oldest first; clear HOMING → still in
      maintenance with BRIDGE only; clear BRIDGE → out; `false` with no code
      clears all.
- [ ] `test_config_manager.gd::test_local_fault_code_in_maintenance_info`
      (existing) is updated and passes.
- [ ] `test_fault_maintenance.gd`: the existing 7 pass, plus
      `test_homing_ok_keeps_other_fault`: `BRIDGE_DOWN` set directly, then
      `machine_fault` / `machine_ok` for homing → still in maintenance.
- [ ] `test_maintenance_screen.gd::test_footer_local_vs_remote`: local →
      the local hint; remote → the remote hint.
- [ ] Screenshot: maintenance with two local faults, looked at (the list
      and footer fit).

## Out of scope

The `BRIDGE_DOWN` detection itself (SAL-02).
