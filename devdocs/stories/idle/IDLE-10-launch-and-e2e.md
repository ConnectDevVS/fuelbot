# IDLE-10 — One-command launch & end-to-end sign-off

**As a** developer or tester, **I want** one command that brings up the mock
backend and the kiosk app, plus a written end-to-end checklist, **so that**
anyone can launch the idle experience in Godot and confirm it matches the plan
and designs.

Plan refs: §7 steps 1, 1b, 2, 3, 4, 10 (the ones that apply to idle), §5 M1/M3
verification.
Depends on: IDLE-01 … IDLE-09.

## Deliverables

```
tools/dev_run.sh
README.md                      # repo root: quick start
devdocs/stories/idle/SIGNOFF.md  # filled-in checklist + screenshots list (created while executing this story)
```

## Spec

### `tools/dev_run.sh [--scenario=<name>] [--editor] [--fullscreen] [--no-mock] [-- <godot user args>]`

Arguments after `--` are forwarded to Godot, e.g.
`-- --capture=/abs/out.png` for a scripted launch check.

1. `set -euo pipefail`, `cd` to the repo root, `GODOT="${GODOT:-godot}"`.
   Check that `$GODOT --version` reports `4.7` and that `python3` exists.
   Otherwise print what's missing and exit 1.
2. `"$GODOT" --headless --path . --import >/dev/null 2>&1 || true`.
3. Mock server (unless `--no-mock`): if
   `curl -sf localhost:8787/__mock/state` already answers, reuse it. Otherwise
   start `python3 mockserver/server.py --port 8787` in the background, log to
   `.mock.log` (add it to `.gitignore`), wait for readiness (50 × 0.1 s), and
   `trap` a kill on exit **only if this script started it**.
4. If `--scenario=` is given: `mockserver/scenario.sh <name>`.
5. Provision: `"$GODOT" --headless --path . --script res://tools/dev_setup.gd`
   (tenant `machine-042`, API `http://127.0.0.1:8787/fuelbot`, poll 10 s). With
   `--no-mock`, run `dev_setup.gd -- --clear` instead, which gives the
   offline/bundled-default experience.
6. Launch: `--editor` → `"$GODOT" -e --path .` (then press F5). Otherwise
   `"$GODOT" --path .`, adding `--fullscreen` if requested (kiosk-like).
7. Print a short banner: the mock URL, how to switch scenarios
   (`mockserver/scenario.sh maintenance_on`), and the user-data folder.

### Root `README.md`

Keep it to a screen or so:
- What this is (one paragraph, link to the plan and `devdocs/stories/idle/`).
- Requirements: Godot **4.7.x** on PATH (or `GODOT=`), Python 3 (stdlib only).
- Quick start: `tools/dev_run.sh`. Editor flow: `python3 mockserver/server.py`
  in one terminal, then `godot --headless --path . --script res://tools/dev_setup.gd`
  once, then open in the editor and press F5.
- Everyday commands: `tools/run_tests.sh`, `tools/check_boot.sh`,
  `tools/screenshot.sh <scene>`, `mockserver/scenario.sh <name|reset>`.
- Where `user://` lives on macOS/Linux and what's in it (`tenant_id.txt`,
  `local_settings.override.json`, `config_cache.json`).
- Kiosk note: run with `--fullscreen`. Provisioning files are never committed.

## End-to-end checklist (record results in `SIGNOFF.md`)

Run everything below on a clean checkout (`git clean -xdf` is **not** needed;
`dev_setup.gd -- --clear` resets `user://`). For each item, record pass/fail
and the evidence (a command output line or a screenshot filename).

**Automated**
- [ ] `python3 -m unittest mockserver/test_server.py` passes.
- [ ] `tools/run_tests.sh` → `ALL TESTS PASSED (n)`.
- [ ] `tools/check_boot.sh` → `BOOT OK`, both provisioned and after `--clear`.
- [ ] `git grep -niE "rzp_(live|test)|api_secret|key_secret"` → nothing (plan
      §7 step 12).
- [ ] `git grep -n "change_scene_to" -- '*.gd' ':!autoload/Nav.gd'` → nothing.

**Launch**
- [ ] `tools/dev_run.sh` opens a 540×960 window straight onto the attract
      screen with the video playing and `● READY`.
- [ ] `tools/dev_run.sh --editor`, then F5, gives the same result.

**Plan §7, idle-relevant steps**
- [ ] **1. Remote fetch.** The mock log shows
      `GET /fuelbot/config tenant=machine-042 … -> 200`. The listing shows the
      PowerFuel branding and the 6 mock flavors in a 2×3 grid with meta lines (data from the
      mock JSON, not hard-coded).
- [ ] **1b. No tenant.** With the mock still running, delete only
      `user://tenant_id.txt` and launch `godot --path .` directly (not
      `dev_run.sh`, which would provision it again). `request_counts` in
      `curl localhost:8787/__mock/state` doesn't increase, and the app runs on
      cache or default.
- [ ] **2. Cache fallback.** After step 1, stop the mock (`--no-mock` would
      clear the cache, so kill the server manually instead) and relaunch
      `godot --path .`. PowerFuel branding still shows (served from
      `config_cache.json`), with the status `OFFLINE` in amber.
- [ ] **3. Bundled default.** `tools/dev_run.sh --no-mock`: `FuelBot`/`FB`
      branding, 4 cards without meta lines, `OFFLINE`. The app stays fully
      navigable.
- [ ] **4. Live catalog change.** `tools/dev_run.sh --scenario=price_change`:
      electro is gone, chocolate is `₹199`, the attract subline reads
      `Four shakes on tap… From ₹75.`. No code edits.
- [ ] **10. Maintenance.** While on attract: `mockserver/scenario.sh maintenance_on`
      shows the maintenance screen within about 10 s, with the remote message,
      2 faults and `ONLINE`. `mockserver/scenario.sh maintenance_no_message`
      shows the local default message. `reset` returns to attract within about
      10 s. Mid-browse flip: on the listing, flip to `maintenance_on`. The
      listing is not interrupted, and after the 60 s inactivity timeout, idle
      redirects to maintenance.

**Flow & design**
- [ ] Attract → tap → listing → tap guava → stub shows `Prymor Guava ₹75` →
      Back → listing → tap vanilla (sold out) → nothing happens → wait 60 s →
      attract, video restarted from the beginning.
- [ ] The video loops past its end without freezing (plan §5 M3).
- [ ] Screenshots `Idle.png`, `FlavorSelect.png` and `Maintenance.png` (via
      `tools/screenshot.sh`) are saved in `.screenshots/` and reviewed
      side by side with PDF pages 1, 2 and 6. Every visual checkbox in
      IDLE-07/08/09 holds. List any deliberate differences in `SIGNOFF.md`
      (e.g. no dBm signal field).

## Acceptance criteria

- [ ] Every checklist item above is ticked in `SIGNOFF.md` with evidence.
- [ ] `tools/dev_run.sh` works from any working directory (`cd /tmp && <repo>/tools/dev_run.sh`).
- [ ] Ctrl+C or closing the window stops the mock server only if the script
      started it.

## Handoff to the next story set

Once this is signed off, the next set starts from here: Ingredients &
Allergens (PDF page 3, replacing the `flavor_detail` stub), then Payment
(Milestone 2 + PDF page 4), then Dispensing/Complete (Milestone 4 + PDF
page 5). The mock server is ready for their routes (IDLE-02 `routes.json`).
