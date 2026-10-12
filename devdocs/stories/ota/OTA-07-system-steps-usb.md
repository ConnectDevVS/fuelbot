# OTA-07 — System steps and the USB stick

**As** FuelBot staff, **I want** to change the Pi's operating system and
settings through a release, and to rescue a machine with a USB stick,
**so that** OS updates and network changes don't need a technician with
admin skills, and a machine the updater can't fix can be recovered by
anyone on site.

Refs: README decisions 6, 7, 17.
Depends on: OTA-04.

## Deliverables

```
deploy/updater/fuelbot_updater.py     # system steps; USB handling
deploy/updater/test_updater.py
deploy/udev/99-fuelbot-usb.rules      # run the updater's USB check when a stick appears (installed by OTA-08)
autoload/RuntimeState.gd              # shows the updater's notices (user://notice.json)
config/local_settings.json            # messages: fault_usb_done, fault_usb_failed
tests/unit/test_runtime_state.gd
tools/make_release.sh                 # --step <script>
devdocs/stories/ota/RELEASING.md      # writing a system step; the OS update recipe
```

## Spec

### System steps

- A release may carry `steps/<name>.sh` files listed in `manifest.steps`
  (`[{"name": "os-2026-11", "file": "steps/os-2026-11.sh", "sha256": …}]`),
  signed with the manifest like every file.
- They run **as root, in order, while the app is stepped aside** (OTA-02's
  update request), before the switch. Exit code: **0** done, **1** failed
  (stop, report `failed: step <name>`, nothing switched), **2** done but
  reboot (the updater reboots and continues after the boot from
  `updater.json`).
- Each step runs once per machine (recorded in `updater.json`); a step must
  be safe to re-run if a power cut interrupts it.
- **OS updates are a system step that installs exact package versions**
  (`apt-get install pkg=version …`, the list produced on the test machine
  by the recipe in RELEASING.md), so the fleet gets exactly what was tested.
  Automatic OS updates are off on every machine (OTA-08).
- Remote access, if ever wanted (README decision 6), is installed the same
  way.

### The USB stick

When a USB stick is plugged in, the updater looks for a `fuelbot/` folder:

- **`fuelbot/release.tar`** — a signed bundle (OTA-03). Installed like a
  server release, at once (an engineer is standing there), still only when
  the app is idle; reported to the server when it's next reachable.
- **`fuelbot/wifi.txt`** — `ssid=…` and `password=…` lines. Saved as the
  machine's Wi-Fi network (NetworkManager), kept alongside the old one
  until the new one connects. Not signed (it isn't code; server traffic is
  HTTPS and releases are signed, so a bad file can only take the machine
  offline). The password is never logged.
- **`fuelbot/identity.txt`** — `tenant=`, `machine=`, `key=` lines,
  written to the app's `user://` files only when they're **missing** (a
  spare card); an existing identity is never overwritten. The key is never
  logged.
- **The person on site sees the result.** The updater writes
  `user://notice.json` (`{"code": "USB_DONE" | "USB_FAILED", "detail": …,
  "until": <UTC time 60 s ahead>}`); the app (`RuntimeState`, OTA-02) sets
  that local fault code until then, so idle shows the maintenance screen
  with "USB update done" or "USB update failed: <reason>", then clears it.
  It's a notice, not a fault: it never interrupts an order (idle is the only
  enforcement point).

## Acceptance criteria

- [ ] Steps run in order as root (fake runner in tests); exit 1 stops the
      release; exit 2 reboots and continues; a step never runs twice; a
      power cut mid-step re-runs it safely.
- [ ] An unsigned or tampered step → the whole release refused.
- [ ] USB release: installed when idle; a bad signature refused and shown
      as `USB_FAILED`.
- [ ] `wifi.txt` adds the network and keeps the old one until the new one
      connects (fake `nmcli`); the password never appears in output.
- [ ] `identity.txt` fills a missing identity and never overwrites one.
