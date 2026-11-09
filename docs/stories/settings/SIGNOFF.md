# Settings and Wi-Fi — sign-off (SET-05)

Executed 2026-11-09 on macOS (Apple M5), Godot 4.7.2.stable.official, branch
`plan/settings-wifi` (off `develop` at `0925650`). Stories: SET-02 `706b5f1`,
SET-03 `e4d03d3`, SET-01 `8a04a4b`, SET-04 `b0f87f7`. Evidence is local and
gitignored: `kiosk/.screenshots/settings-e2e/` (walker screenshots,
`app-a.log`, `app-b.log`) and `kiosk/.screenshots/settings/` (one capture per
settings page).

**Status: the Mac flows PASS (all 11, twice from a clean state). The real-Pi
checks are OPEN: no Pi was available.** The settings screens are built and
tested against `tools/fake_nmcli.py`; what only a Pi can prove (the polkit
rule, how the password reaches NetworkManager, reconnecting after a reboot)
is listed below and carried forward in the root CLAUDE.md.

## Automated

| Check | Result |
|-------|--------|
| `tools/run_tests.sh` | PASS, `ALL TESTS PASSED (291)` (250 before this set: PIN store 9, hold 8, PIN pad 8, keyboard 9, Wi-Fi 17, settings screen 14, maintenance network cell 1). `--filter=settings` and `--filter=test_wifi` re-run 2× each, green |
| `tools/check_boot.sh` | PASS, `BOOT OK` |
| `python3 -m unittest tools/test_fake_nmcli.py` | PASS, 7 tests |
| New `run_tests.sh` checks | the PIN, the keyboard's text and Wi-Fi passwords are never formatted into output (source greps); the test PIN `918273` and password `SENTINEL3…` never appear in the test log; every standalone tool script compiles on its own (this caught SET-02's `dev_setup.gd`, fixed in SET-01) |

## Mac end to end: the real app, real taps

A temporary walker (deleted afterwards) drove the real app with injected
taps at real screen positions, no `Nav.dry_run`: the 5 s corner hold, the
PIN keys, the network rows and every key of the on-screen keyboard. Two
launches, so "locked across a restart" is a real restart. The app ran with
`-- --sandbox` (no dev data touched), Wi-Fi through `tools/fake_nmcli.py`
with its state in a scratch folder, the dead-bridge watchdog off, and the PIN
lockout shortened to 25 s (300 s in production).

| # | Flow | Result |
|---|------|--------|
| 1 | Hold the top-left corner 5 s on idle | PASS. PIN pad; `OrderState.order_id` empty (the release didn't start an order) |
| 2 | Wrong PIN ×5; restart the app; wait | PASS. "Too many tries. Try again in 1 min.", keys dimmed; **still locked after the restart**; unlocked at the end of the lockout |
| 3 | Right PIN | PASS. The grid with the Network tile |
| 4 | Network | PASS. GymStaff (connected) on top, not tappable, then GymGuest, Office-5G, Corp by signal |
| 5 | Office-5G, right password (typed on the keyboard) | PASS. Connecting → "Connected to Office-5G" → the list with Office-5G on top |
| 6 | GymStaff, wrong password | PASS. "Wrong password. Try again." for **3.0 s**, hid itself, the list; Office-5G still connected (rolled back) |
| 7 | GymGuest (open) | PASS. Connected without the password page |
| 8 | Corp (enterprise) | PASS. "This network type isn't supported." |
| 9 | No touch | PASS. Back to idle 60 s after the last touch |
| 10 | Maintenance on (`HOMING_TIMEOUT`), hold, PIN, Exit | PASS. PIN pad → settings → Exit → maintenance again; the network cell read `OFFLINE · GymGuest 64%` |
| 11 | Leak check | PASS. The PIN and both passwords: **0** matches in both app logs, the telemetry queue and the fake's `nmcli` call log; both password connects went through `passwd-file`; no `wifi_secret.tmp` left |

The telemetry queue held exactly the audit trail: `settings_pin_failed` ×5,
`settings_locked`, `settings_opened`, `wifi_connected`, `wifi_connect_failed`,
`wifi_connected`, `settings_opened` (it stays queued: the sandboxed run has no
backend).

**Earlier runs that failed, and why.** Before these two passes, three runs
failed: flow 9 once (no return to idle within 75 s) and flow 1 twice (the hold
started an order). The walker's windows open in front of whoever is at the
Mac, and real pointer events reach the app: a real mouse movement out of the
corner cancels a hold (so its release is an ordinary tap), and a real click
restarts the inactivity timer. The walker then tagged its own events and
logged any other input: the next runs logged real mouse movement and clicks
and still passed. The earlier failures had no such log, so real input is
the likely cause, not a proven one. A unit test covers each behaviour
(`test_settings_hold.gd`, `test_settings_screen.gd`). On a kiosk there's no
second pointer; a finger that drifts out of the corner square cancelling the
hold is intended.

## Visual (looked at)

- `settings/1-home.png`: one square tile, the Wi-Fi fan in accent, "Network",
  the current network under it.
- `settings/2-list.png`, `6-list-after.png`: the connected row (accent
  border, tick, signal bars, "Connected · FuelBot server …"), then rows with
  bars and locks. Fits at 1080 × 1920.
- `settings/3-password.png`: title, masked field with Show, the keyboard at
  full width under it.
- `settings/4-connecting.png`, `5-success.png`, `7-error.png`: the spinner,
  the green tick, the amber cross; centred and readable.
- `settings-e2e/a3-locked.png`: the locked pad with dimmed keys.
  **Found by looking:** the theme's disabled button style looked enabled, so
  a locked pad looked usable; the keys are now drawn at 35 % (SET-02).
- `settings-e2e/b9-maintenance-again.png`: the network cell names the network.
- **For the product owner:** there is no design page for these screens
  (README decision 16); they follow the maintenance screen's style. Please
  look at the captures above before the first deployment.

## Real Pi: OPEN

| # | Check | Status |
|---|-------|--------|
| 1 | SET-01 spike: `passwd-file` saves the password, or switch to `--ask`; adding a WPA profile without the psk is accepted; the password is not in `ps -ef` or the journal | open |
| 2 | Connect to a phone hotspot from the screen; the dashboard shows the machine online | open |
| 3 | Reboot: reconnects by itself | open |
| 4 | Wrong password: the previous network comes back, no new profile saved | open |
| 5 | Without the polkit rule, the kiosk user gets an error, never a crash | open |
| 6 | Touch feel: keys and rows easy to hit; a rescan doesn't freeze the screen | open |

How to set a Pi up and run each check: [deploy/README.md](../../../deploy/README.md)
("Wi-Fi settings on a Raspberry Pi"). They can be done by hand on any Pi now,
or with Milestone 8 (the Pi image, the kiosk user, `provision.sh` installing
the polkit rule, asking for the PIN and setting the Wi-Fi country; OTA-07/08
updated).

## Deviations from the stories

- **SET-02:** the core class is `PinStore` (`core/pin_store.gd`): two files
  would otherwise have been `settings_pin.gd`. The delete key says DEL (no
  bundled font has ⌫). Disabled keys are dimmed.
- **SET-03:** DEL sits in the same place on every layer and the bottom row
  (layer key, space, submit) is the same on every layer, so the symbols layer
  has no digits row (the letters layer has it).
- **SET-01:** the connect timeout gets a 5 s grace (`connect_grace_sec`)
  before the app kills nmcli; the profile is brought up by UUID; the fake's
  slow-down knob is `delay: {sec, on, times}`. `dev_setup.gd` has
  `--wifi=fake|real` (fake by default).
- **SET-04:** one `settings.gd` instead of four page scripts; icons drawn by
  `NetIcon`; busy and other failures show `wifi_error_generic`.
- **SET-05:** the technician steps went into a new `docs/technician-guide.md`
  rather than `docs/deployment_guide.md`, which is the server deployment
  guide.
