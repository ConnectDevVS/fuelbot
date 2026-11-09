# IDLE-07 — Maintenance screen

**As an** operator, **I want** the machine to show a clear out-of-service
screen with technician diagnostics whenever it is flagged for maintenance,
**so that** customers don't try to order and a technician can see why.

Design: **PDF page 6, "05 Maintenance (unbranded)"**.
Plan refs: §3.10 (message source by cause), §3.11 (`scenes/maintenance/`,
return to idle when the flag clears; no interaction).
Depends on: IDLE-06.

## Deliverables

```
scenes/maintenance/Maintenance.tscn
scenes/maintenance/maintenance.gd
scenes/maintenance/hazard_stripe.gd       # class_name HazardStripe (Control, _draw)
tests/unit/test_maintenance_screen.gd
```

## Layout (1080×1920, top to bottom)

This screen is **unbranded** by design: no tenant logo tile or name.

| Region | Content |
|--------|---------|
| Hazard stripe | `HazardStripe`, full width, 28 px tall, at the very top. `_draw()` fills 45° parallelograms 36 px wide, alternating `WARNING` / `BG`. |
| Header row (top margin 96) | Left: `Mono` `get_message("maintenance_header")`. Right: `Mono` `Fmt.datetime_short(now)`, refreshed every second. |
| Status row (gap 90) | `StatusDot` (WARNING, diameter 22, pulse) + `MonoWarning` `maintenance_status` |
| Title (gap 24) | `DisplayXL` `maintenance_title` ("OUT OF\nSERVICE"). If "SERVICE" overflows the 936 px content width, override this label's font size down to 112 and note it in the PR. |
| Message (gap 36) | `Body` at font size 40, autowrap `WORD_SMART`, text = `get_maintenance_info().message` |
| Diagnostics panel (gap 64) | `DiagPanel`: header row `MonoMuted` `maintenance_diagnostics_title` (margin 28, 2 px BORDER divider under it), then a **2-column grid of 8 cells** separated by 2 px BORDER hairlines. Each cell has margin 28 and holds `VBox[Mono label, MonoValue value]`. |
| Faults panel (gap 36) | `FaultPanel`, **hidden when `faults` is empty**. `MonoWarning` `maintenance_faults_title` with `{count}`, then one `MonoValue` line per fault: `"%s · %s" % [code, description]` |
| Footer (pinned to bottom) | 2 px BORDER line, then a margin-72 row: `MonoMuted` `maintenance_service` with `{phone}` (hidden if `tenant.support_phone` is empty) … `Mono` `maintenance_exit_hint` |

Diagnostics cells (label key → value):

| Label key | Value |
|-----------|-------|
| `diag_machine_id` | `ConfigManager.tenant_id`, or `diag_unknown` |
| `diag_site` | `get_tenant().site`, or `diag_unknown` |
| `diag_flagged_by` | `info.flagged_by`, or `diag_unknown` |
| `diag_flagged_at` | `Fmt.time_short(u) + " · " + Fmt.ago(now - u)` where `u = Fmt.iso_to_unix(info.flagged_at)`; `diag_unknown` if `u == 0` |
| `diag_firmware` | `"%s (godot %d.%d.%d)" % [ProjectSettings "application/config/version", major, minor, patch]` from `Engine.get_version_info()` |
| `diag_network` | `maintenance_network_online` in **SUCCESS** colour when `ConfigManager.is_online`, else `maintenance_network_offline` in WARNING |
| `diag_last_heartbeat` | `Fmt.ago(now - last_successful_fetch_unix)`, or `diag_never` when 0 |
| `diag_payments` | `maintenance_payments_disabled` (always; the machine takes no payment here) |

The design shows signal strength (`4G · -68 dBm`). There is no source for that
data, so it's omitted. Colour overrides go through
`add_theme_color_override("font_color", Palette.X)`.

## Behaviour

- `_ready()`: `_render()` from `ConfigManager.get_maintenance_info()`, then
  connect:
  - `ConfigManager.maintenance_changed(enabled, message)`: if `not enabled`,
    call `Nav.go_idle()`; otherwise `_render()` (the message or faults may
    have changed).
  - `ConfigManager.connectivity_changed`: re-render the network and heartbeat
    cells.
- After the first render, if `not ConfigManager.is_in_maintenance()`, call
  `Nav.go_idle.call_deferred()`. The flag can clear between idle's redirect and
  this scene connecting to the signal (found during execution).
- A 1 s `Timer` refreshes the header clock, `flagged_at` "ago" and the
  heartbeat.
- **No interaction.** The scene consumes no input and has no buttons (plan
  §3.11).
- Message source (plan §3.10) is decided entirely by
  `get_maintenance_info()`: the remote message when remote-flagged and
  non-empty, otherwise `maintenance_default`. The scene doesn't re-implement
  that rule.

## Acceptance criteria

`tests/unit/test_maintenance_screen.gd` drives the **real** autoload's state
and restores it:
`before_each` stores `current_config.duplicate(true)`,
`remote_maintenance_enabled` and `local_hardware_fault_active`, and sets
`Nav.dry_run = true`. `after_each` restores them all and frees the scene.
- [ ] **Remote, with message:** set
      `ConfigManager.current_config.maintenance` to the normalised
      `maintenance_on` block (from `load_mock_config("maintenance_on")`:
      extend the IDLE-06 helper to resolve `extends` + `body_patch` using the
      same merge rules as the mock server) and `remote_maintenance_enabled = true`.
      Instantiate the scene. The message label shows the remote text,
      `flagged_by` shows `Remote console · ops@fuelbot`, the faults panel is
      visible with 2 lines, and the first line starts `E-204 · `.
- [ ] **Remote, empty message:** `maintenance_no_message` → message equals
      `get_message("maintenance_default")` and the faults panel is hidden.
- [ ] **Local fault:** `set_local_hardware_fault(true)` → message is
      `maintenance_default`, and flagged-by is `maintenance_local_fault_by`.
- [ ] **Flag clears:** with the scene open, `set_local_hardware_fault(false)`
      → within 2 frames `Nav.last_requested == ScenePaths.IDLE`.
- [ ] Payments cell reads `DISABLED`. Firmware cell starts with `0.1.0 (godot 4.`.
- [ ] Extend `test_order_state_nav.gd`: `ScenePaths.MAINTENANCE` now exists.

Visual: run the mock server with `maintenance_on`, then
`godot --headless --path . --script res://tools/dev_setup.gd` and
`tools/screenshot.sh res://scenes/maintenance/Maintenance.tscn .screenshots/Maintenance.png 5`. Compare
with PDF page 6:
- [ ] Amber/black diagonal stripe across the top edge.
- [ ] Heavy white two-line "OUT OF / SERVICE", amber pulsing dot plus amber
      mono status line above it.
- [ ] Diagnostics panel with 2 × 4 hairline grid. MACHINE ID `machine-042`,
      SITE `PowerFuel Gym / Bay 02`, NETWORK `ONLINE` in green.
- [ ] Amber-tinted faults panel with two `E-xxx · …` lines.
- [ ] Footer: `SERVICE: 1800 419 0142` left, `EXIT VIA REMOTE CONSOLE ONLY`
      right.

General:
- [ ] `tools/run_tests.sh` and `tools/check_boot.sh` pass.

## Out of scope

Who sets the local fault (TelemetryReporter, Milestone 5). Technician
clear/ack actions (plan §3.10 "mechanism TBD").
