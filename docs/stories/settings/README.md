# Settings and Wi-Fi — story set

A technician at a gym can connect the machine to the gym's Wi-Fi from the
touchscreen, without a laptop, a keyboard or a USB stick. A hidden long press
opens a PIN pad; the right PIN opens a settings screen with one tile,
**Network**, which lists the Wi-Fi networks in range. Tap a network, type the
password on the on-screen keyboard, and the machine connects.

- Plan: [kiosk plan](../../plans/greenfield-rewrite.md) §3.10–3.11 (the
  maintenance screen, which this set changes), §4 (folder layout), §5
  Milestone 8 (the Pi image this runs on).
- Builds on: the [idle set](../idle/README.md) (idle, maintenance,
  `ConfigManager`, `Nav`, theme and components), the
  [telemetry set](../telemetry/README.md) (`TelemetryReporter.report_event`).
- Related, not built yet: the [OTA set](../ota/README.md). OTA-07 (USB
  `wifi.txt`; `identity.txt` gains `pin=`) and OTA-08 (`provision.sh` asks
  for the PIN with the rest of the identity and installs the polkit rule)
  gain small additions from this set (SET-01, SET-02).
- Telemetry contract: [server plan](../../../server/devdocs/plans/server-plan.md)
  §3 (the event table gains this set's events; no server code changes).
- Conventions, gotchas and test patterns: [kiosk/CLAUDE.md](../../../kiosk/CLAUDE.md).

**Paths:** as in every set since 2026-10-15, `autoload/`, `scenes/`, `tools/`,
`tests/` are relative to `kiosk/`; `deploy/` is the top-level folder started by
OTA-04.

## Goals

1. **Really simple to use.** One tile, one list, one password page. Big touch
   targets, plain words, no settings a technician has to understand.
2. **Works when the network doesn't.** Opening settings and checking the PIN
   never need the server: this screen is used exactly when the machine is
   offline.
3. **Can't hurt a customer.** Settings open only from idle or the
   maintenance screen, never during an order, and always fall back to idle.
4. **Secrets stay secret.** The Wi-Fi password and the PIN never appear in a
   log, a telemetry event, a screenshot or a commit. The app never runs as
   root.

## The flow

```
idle / maintenance ──hold top-left corner 5 s──▶ PIN pad ──right PIN──▶ Settings (grid)
                                                   │ wrong ×5 → locked 5 min      │ tap "Network"
                                                   ▼                              ▼
                                                 back to idle              Wi-Fi list (connected network on top)
                                                                                  │ tap a network
                                                                                  ▼
                                                                           Password page (on-screen keyboard)
                                                                                  │ Connect → "Connecting…"
                                                         ┌────────────────────────┴───────────────────────┐
                                                   success: "Connected to <name>"              error: message for 3 s,
                                                   (2 s) → Wi-Fi list, it's on top             hides itself → Wi-Fi list
```

Every page has a big **Back** button (the grid has **Exit**). 60 s without a
touch anywhere in settings returns to idle (never while "Connecting…").

## Execution order

| # | Story | Depends on | Produces |
|---|-------|-----------|----------|
| 01 | [Wi-Fi backend](SET-01-wifi-backend.md) | — | `Wifi` autoload over `nmcli` (status, scan, connect, roll back), `tools/fake_nmcli.py`, the polkit rule in `deploy/polkit/`, the Pi spike on how the password reaches NetworkManager |
| 02 | [PIN and hidden entry](SET-02-pin-and-entry.md) | — | the 5 s corner hold on idle and maintenance, the PIN pad scene, the PIN as an identity field (`user://settings_pin.txt`, hashed), lockout, audit events, `tools/set_settings_pin.sh` |
| 03 | [On-screen keyboard](SET-03-keyboard.md) | — | `ui/components/keyboard/`, in the gallery |
| 04 | [Settings screen: grid, Wi-Fi list, password](SET-04-settings-screen.md) | 01, 02, 03 | `scenes/settings/`: the three pages, the success and error messages, the inactivity return; network name and signal on the maintenance screen |
| 05 | [End-to-end and sign-off](SET-05-e2e-signoff.md) | 01–04 | walker run against the fake `nmcli`, the real-Pi check, SIGNOFF.md, plan / README / CLAUDE.md updates |

01, 02 and 03 are independent and can be built in any order.

## Definition of Done (every story)

As in the existing kiosk sets: `tools/run_tests.sh` → `ALL TESTS PASSED`,
`tools/check_boot.sh` → `BOOT OK` (run `godot --headless --path . --import`
first when a `class_name` is added), the Python tests → `OK` (plus
`python3 -m unittest tools/test_fake_nmcli.py` from SET-01). Timing tests
(hold, lockout, connect timeout, inactivity) re-run 2–3× with `--filter=`.
UI changes get a screenshot that's actually looked at. One commit per story
(`SET-NN: <title>`), chained with `&&` after the checks; files staged
explicitly. No password, PIN or PIN file in a commit, log or screenshot.

## Decisions

From the product owner (2026-11-09):

1. **A settings page hidden behind a PIN**, in the kiosk app, for connecting
   to the gym's Wi-Fi. Chosen over a setup hotspot (it would open a way into
   the machine, against OTA decision 2) and over the USB stick alone (needs
   a laptop).
2. **The settings page is a grid with one square tile, "Network".** More
   tiles can be added later; v1 has only this one.
3. **Network → the list of Wi-Fi networks in range; tapping one opens the
   password page.** On success: a success message, then back to the list
   with the connected network on top. On error: the error message for
   **3 seconds**, hidden by itself, then back to the list.
4. **Make it really simple to use.**

Proposed while writing this set (2026-11-09; the product owner can change
any of them — the stories follow them until then):

5. **The PIN is part of the machine's identity** (product owner,
   2026-11-09), next to the tenant id, machine id and machine key. It's
   written by the same provisioning step (`provision.sh` prompts for it with
   the key) and carried by the same USB `identity.txt` (`pin=` line), not
   set from the dashboard, so it works on a machine that has never been
   online. On the machine it's stored only as a hash, as
   `user://settings_pin.txt`, beside `tenant_id.txt`, `machine_id.txt` and
   `machine_key.txt`. Like the rest of the identity, an existing PIN is
   never overwritten by the USB stick (a missing one is filled in), and
   every machine gets its own. A dashboard-managed PIN can be added later.
6. **For FuelBot technicians only.** Gym staff don't get the PIN in v1.
7. **6 digits; 5 wrong tries lock the pad for 5 minutes**, and the lock
   survives an app restart. Only a salted SHA-256 hash is stored
   (`user://settings_pin.txt`, outside git like every `user://` file). A
   6-digit hash can be brute-forced by anyone who can read the file, but
   whoever can read it already has the machine; the lockout is what
   protects the touchscreen.
8. **No PIN in the identity → settings can't be opened** (the pad says
   "Settings not set up"). There is no default PIN on a real machine. Dev
   machines get one from `dev_setup.gd`.
9. **The hidden entry is a 5 s hold in the top-left 200 × 200 px** of idle
   and of the maintenance screen, with no visual hint. A short tap there on
   idle still starts an order as before; the release that ends a 5 s hold
   is swallowed. **Deviation from plan §3.11** ("maintenance: no
   interaction"): the hold is the maintenance screen's only input.
10. **Settings open only from idle and maintenance**, so no order is in
    progress (idle has already reset `OrderState`). The settings screens
    aren't idle, so an OTA install waits until they close. If maintenance is
    switched on while settings are open, settings stay open; leaving goes
    through `Nav.go_idle()`, which shows maintenance as usual.
11. **The app talks to NetworkManager through `nmcli`, as the kiosk user,
    allowed by a polkit rule** limited to Wi-Fi scan, network control and
    changing system connections. No root helper. A compromised app could
    change the network, but not install code (releases are signed).
12. **The password never goes on a command line or into a log.** How it
    reaches NetworkManager (a temporary `passwd-file` in `user://`, or
    `nmcli --ask` on stdin) is settled by the SET-01 spike on a real Pi;
    the temporary file is deleted straight after.
13. **A failed connect never strands the machine.** The network that was
    connected before is brought back up and the new, failed profile is
    deleted, so a wrong password isn't saved.
14. **Kept simple on purpose (v1 leaves out):** forgetting a saved network,
    hidden networks, enterprise (username + password) networks, IP or DNS
    settings. Enterprise networks appear in the list but tapping one shows
    "This network type isn't supported" (3 s, like any error). A network
    without a password connects straight away, without the password page.
    Hidden networks can come through the USB `wifi.txt` (OTA-07).
15. **Audit:** `settings_opened`, `settings_pin_failed`, `settings_locked`,
    `wifi_connected` (`ssid`, `signal`) and `wifi_connect_failed` (`ssid`,
    `reason`) are posted through `TelemetryReporter`; they reach the server
    when the machine is next online. Never a password or a PIN digit. The
    server stores unknown event types already (server plan §3), so only the
    plan's event table changes.
16. **No design page exists** for these screens. They follow the
    maintenance screen's unbranded style (Palette, theme variations) and
    the sizes in SET-04. The screenshots are reviewed by the product owner
    in SET-05.

## Messages (`config/local_settings.json` → `messages`)

Added by the stories that use them; the full list is here so the wording can
be reviewed in one place.

| Key | Text |
|-----|------|
| `settings_pin_title` | `ENTER PIN` |
| `settings_pin_wrong` | `Wrong PIN` |
| `settings_pin_locked` | `Too many tries. Try again in {minutes} min.` |
| `settings_pin_not_set` | `Settings not set up on this machine.` |
| `settings_pin_delete` | `DEL` |
| `keyboard_symbols` | `?123` |
| `keyboard_letters` | `ABC` |
| `keyboard_space` | `space` |
| `keyboard_delete` | `DEL` |
| `keyboard_submit` | `OK` |
| `settings_title` | `SETTINGS` |
| `settings_exit` | `Exit` |
| `settings_tile_network` | `Network` |
| `wifi_title` | `WI-FI` |
| `wifi_searching` | `Searching for networks…` |
| `wifi_none_found` | `No networks found.` |
| `wifi_refresh` | `Refresh` |
| `wifi_connected` | `Connected` |
| `wifi_server_ok` | `FuelBot server reachable` |
| `wifi_server_down` | `FuelBot server not reachable` |
| `wifi_ethernet` | `Connected by cable` |
| `wifi_password_title` | `Password for {ssid}` |
| `wifi_show` | `Show` |
| `wifi_hide` | `Hide` |
| `wifi_connect` | `Connect` |
| `wifi_connecting` | `Connecting to {ssid}…` |
| `wifi_success` | `Connected to {ssid}` |
| `wifi_error_password` | `Wrong password. Try again.` |
| `wifi_error_not_found` | `Network not found. Move closer or refresh.` |
| `wifi_error_timeout` | `Couldn't connect in time. Try again.` |
| `wifi_error_unsupported` | `This network type isn't supported.` |
| `wifi_error_generic` | `Couldn't connect. Try again.` |
| `wifi_error_unavailable` | `Wi-Fi isn't available on this machine.` |

## Timing and settings (`config/local_settings.json`)

| Key | Value | Used by |
|-----|-------|---------|
| `timing.settings_hold_sec` | 5 | SET-02 |
| `timing.settings_pin_inactivity_sec` | 30 | SET-02 |
| `timing.settings_pin_lockout_sec` | 300 | SET-02 |
| `timing.settings_inactivity_sec` | 60 | SET-04 |
| `timing.settings_success_return_sec` | 2 | SET-04 |
| `timing.settings_error_return_sec` | 3 | SET-02 ("Wrong PIN"), SET-04 |
| `timing.wifi_scan_timeout_sec` | 15 | SET-01 |
| `timing.wifi_connect_timeout_sec` | 30 | SET-01 |
| `settings.pin_path` | `user://settings_pin.txt` | SET-02 |
| `settings.pin_lock_path` | `user://settings_pin_lock.json` | SET-02 |
| `settings.pin_length` | 6 | SET-02 |
| `settings.pin_max_attempts` | 5 | SET-02 |
| `settings.hold_zone_px` | 200 | SET-02 |
| `wifi.nmcli_path` | `nmcli` | SET-01 |
| `wifi.interface` | `wlan0` | SET-01 |
| `wifi.fake_state_path` | (dev override only) `user://fake_nmcli.json` | SET-01 |

## Deviations from the plan

- Plan §3.11: the maintenance screen gets one input, the hidden hold
  (decision 9).
- Plan §4: new `autoload/Wifi.gd` (after `FlavorImages`, before
  `DevCapture`), `core/pin_store.gd`, `scenes/settings_pin/`, `scenes/settings/`,
  `ui/components/keyboard/`, `ui/components/settings_hold.gd`,
  `tools/fake_nmcli.py`, `deploy/polkit/`.
- Back buttons reuse the existing `back` message ("Back") and `←`.
- **Glyphs:** neither bundled font (Archivo, JetBrains Mono) has `⌫`, `✓`
  or `⇧` (`✕` and `•` are in JetBrains Mono only). The PIN pad's delete key
  says DEL; the keyboard's ⇧ uses JetBrains Mono; SET-04 draws the tick
  and the Wi-Fi icon in code (like `StatusDot`).
- IDLE-07 left out the design's signal cell for lack of data; SET-04 adds the
  network name and signal to the network cell.

SET-05 records these in the plan's §0 decision log.
