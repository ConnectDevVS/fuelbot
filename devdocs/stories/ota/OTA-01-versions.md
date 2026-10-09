# OTA-01 — Versions on the machine

**As** FuelBot staff, **I want** every machine to know and report which app,
bridge and firmware it runs, **so that** a rollout can be targeted and
checked, and a machine that's behind is visible.

Refs: README decisions 4, 11; server plan §3.1 (headers).
Depends on: —

## Deliverables

```
project.godot                        # application/config/version stays the app's (release) version
autoload/ConfigManager.gd            # version headers in _headers()
autoload/TelemetryReporter.gd        # keeps the bridge's and firmware's versions from the heartbeat
scenes/maintenance/maintenance.gd    # SOFTWARE / BRIDGE / FIRMWARE rows
config/local_settings.json           # messages: diag_software, diag_bridge_version (diag_firmware relabelled)
hardware/bridge/udprxtx.py           # BRIDGE_VERSION; versions in bridge_status
hardware/bridge/test_udprxtx.py
hardware/firmware/VM_code.ino        # // OTA: FIRMWARE_VERSION; "STATUS:BOOT v<n>"
hardware/firmware/test_firmware.py   # simulator test for the boot line
tools/fake_dispense_bridge.py        # sends the version fields
tools/fake_arduino_serial.py         # prints STATUS:BOOT v<n>
tools/test_fakes.py
tests/unit/test_*.gd                 # headers, maintenance rows, heartbeat versions
```

## Spec

- **App version:** `ProjectSettings` `application/config/version` (already
  `0.1.0`) is the release version. It's bumped in the release commit, never
  by hand on a machine.
- **Bridge version:** `BRIDGE_VERSION = "1.0.0"` in `udprxtx.py`, bumped
  when the bridge changes. `bridge_status` gains `bridge_version` and
  `firmware_version` (the last one seen, or null).
- **Firmware version:** `FIRMWARE_VERSION` (an integer, starting at 1) in
  the sketch. The boot line becomes `STATUS:BOOT v<n>`. The bridge's
  `STATUS_RE` already accepts a detail after the stage; it reads `v<n>`
  from it. Old firmware's bare `STATUS:BOOT` means "unknown" (null).
  Firmware changes follow the root CLAUDE.md rule: a simulator test.
- **Headers on backend calls** (config, telemetry, sales; never the image
  GET or Razorpay), added where `X-Machine-Id` is added
  (`ConfigManager._headers()`):
  - `X-App-Version: 1.4.0`, always;
  - `X-Bridge-Version`, `X-Firmware-Version`, when known from a heartbeat.
- **Maintenance diagnostics:** today's "FIRMWARE 0.1.0 (godot 4.7.2)" row
  shows the *app* version under the wrong label. It becomes three rows:
  `SOFTWARE 1.4.0 (godot 4.7.2)`, `BRIDGE 1.0.0`, `FIRMWARE v1` (`—` when
  unknown). Labels come from `messages`. Compare the screenshot with PDF
  page 6.

## Acceptance criteria

- [ ] `ConfigManager._headers()` carries `X-App-Version` (unit test, as
      `test_config_manager.gd` checks `X-Machine-Id`); the image GET and
      the Razorpay calls don't use `_headers()` and carry no version.
- [ ] After a heartbeat with versions, the next backend call carries
      `X-Bridge-Version` / `X-Firmware-Version`; before one, it doesn't.
- [ ] The bridge reads `v3` from `STATUS:BOOT v3`, null from `STATUS:BOOT`;
      `bridge_status` carries both versions (`test_udprxtx.py`).
- [ ] The simulator prints `STATUS:BOOT v<FIRMWARE_VERSION>` at boot
      (`test_firmware.py`); `tools/check_firmware.sh` passes.
- [ ] The fakes speak the new lines and fields (`tools/test_fakes.py`).
- [ ] The maintenance screen shows the three rows; screenshot looked at.
