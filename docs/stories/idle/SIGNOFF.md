# Idle screens — sign-off (IDLE-10)

Executed 2026-09-24 on macOS (Apple M5), Godot 4.7.2.stable.official, branch
`idle-screens`. Screenshots are in `.screenshots/` and `.screenshots/e2e/`
(gitignored), produced by `tools/screenshot.sh` or the `DevCapture` hook.

## Automated

| Check | Result | Evidence |
|-------|--------|----------|
| `python3 -m unittest mockserver/test_server.py` | PASS | `Ran 8 tests … OK` |
| `tools/run_tests.sh` | PASS | `ALL TESTS PASSED (67)` |
| `tools/check_boot.sh`, provisioned and after `--clear` | PASS | `BOOT OK` ×2 |
| Credential grep (plan §7 step 12) | PASS for code and config, see note | Only hits are in `devdocs/`: the plan quotes the already-exposed key **ID** `rzp_live_Sjz0kAySedgQjK` (not the secret), which it flags for rotation |
| No `change_scene_to` outside `autoload/Nav.gd` | PASS | grep empty |

## Launch

| Check | Result | Evidence |
|-------|--------|----------|
| `tools/dev_run.sh` from another directory (`cd /tmp`) | PASS | Banner printed, remote config loaded, `e2e-launch.png` shows attract with `● READY`; the mock server it started was stopped on exit |
| `tools/dev_run.sh --editor`, then F5 | Not run | Needs an interactive editor session; the same main scene is covered by the launch check |

## Plan §7, idle-relevant steps

| Step | Result | Evidence |
|------|--------|----------|
| 1. Remote fetch | PASS | Mock log `GET /fuelbot/config tenant=machine-042 … -> 200`; `e2e/remote-idle.png`, `e2e/remote-listing.png` show PowerFuel branding and 6 cards with meta lines |
| 1b. No tenant | PASS | `request_counts {'/fuelbot/config': 0}`; `e2e/notenant-idle.png` runs from cache, `OFFLINE` |
| 2. Cache fallback | PASS | `e2e/cache-offline.png`: PowerFuel branding with the server stopped, amber `OFFLINE` |
| 3. Bundled default | PASS | `e2e/default-idle.png`, `e2e/default-listing.png`: `FB`/FuelBot, 4 cards without meta, "Four shakes…", `OFFLINE` |
| 4. Live catalog change | PASS | `e2e/price-idle.png`: "Four shakes … From ₹75."; `e2e/price-listing.png`: 5 cards, chocolate `₹199` |
| 10. Maintenance on (live) | PASS | `e2e/maint-flip-on.png`: attract → maintenance within one 10 s poll; remote message, 2 faults, `ONLINE` |
| 10. Empty remote message | PASS | `e2e/maint-nomsg.png`: local default message, faults panel hidden |
| 10. Maintenance off (live) | PASS | `e2e/maint-flip-off.png`: back to attract after `reset` |
| 10. Mid-browse non-interruption | PASS | `e2e/midbrowse-15s.png`: listing still shown after the flag flipped; `e2e/midbrowse-72s.png`: after the 60 s inactivity timeout → idle → maintenance |

## Flow & design

| Check | Result | Evidence |
|-------|--------|----------|
| Tap flow (attract → listing → card → stub → back; sold-out ignored; inactivity → attract) | PASS (automated) | `test_idle_screen`, `test_flavor_select` cover each transition via `Nav` in dry-run mode. Not clicked through by hand. |
| Video loops past its end (17.4 s clip) | PASS | `e2e/loop-17s.png` vs `e2e/loop-25s.png` show different frames 8 s into the second loop, so the video did not freeze |
| Design comparison: page 1 / 2 / 6 | PASS | `Idle.png`, `FlavorSelect.png`, `Maintenance.png` |

### Deliberate differences from the PDF

- Maintenance diagnostics omit the signal-strength field (`4G · -68 dBm`). There is no data source for it.
- Demo catalog uses the old build's product photos and sample nutrition data.
  The design's drink names were illustrative.
- The attract hero plays the bundled ad video rather than the design's still photo (plan §3.13).
- Tuned from the story tokens while matching the screenshots: card padding 32
  (was 36), card image area 160 (was 176), Heading 42 px (was 46), MonoValue
  27 px (was 30), footer left text 22 px. This lets six cards fit 1920 px and
  keeps diagnostics on one line. The stories were updated to match.

## Issues found and fixed during execution

- **Maintenance race:** if the flag cleared between idle's redirect and the
  maintenance scene connecting (for example a fast boot fetch overriding a
  cached flag), the screen stayed up. Maintenance now re-checks on entry.
  Covered by `test_already_cleared_on_entry_returns_to_idle`.
- **Test harness:** a script error aborts a test coroutine before its asserts
  run, so it counted as a pass. `run_tests.sh` now fails on any `SCRIPT ERROR`.
  The signal helper was also changed to `watch_signal()` + `wait_until()`,
  because an un-awaited coroutine call returns no handle in Godot 4.

## Open items (outside idle scope)

- Plan §2.1.3/§3.3 and `VM_code.ino` still assume 4 motors. Hoppers 5–6 need
  firmware and wiring work (README decision 5).
- `--editor` + F5 path to be confirmed by hand.
- Rotate the Razorpay key referenced in the plan, as the plan already notes.
