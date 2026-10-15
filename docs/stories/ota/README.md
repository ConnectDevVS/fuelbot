# Over-the-air updates — story set (Milestone 9)

Lets FuelBot staff update the kiosk app and the bridge on every deployed
machine from the web dashboard, safely: never during a customer's order,
in a night window unless a staff member forces it, one test machine first,
and with an automatic switch back to the previous version when a new one
doesn't come up healthy.

- Plans: [kiosk plan](../../plans/greenfield-rewrite.md) §5 Milestone 9
  (and Milestone 8, which builds the Pi image the updater ships in);
  [server plan](../../../server/devdocs/plans/server-plan.md) §3.8–3.10
  (the machine's update contract) and §4.14 (releases and rollouts);
  [dashboard plan](../../../webdashboard/devdocs/plans/dashboard-plan.md)
  §5.19 (the staff pages).
- Builds on: machine identity and keys (server S1, S4), `ReportQueue`, the
  local fault set and the maintenance screen (Milestones 5–6), the
  dashboard (S7).
- Conventions, gotchas and test patterns: [CLAUDE.md](../../../CLAUDE.md)
  (kiosk), [server/CLAUDE.md](../../../server/CLAUDE.md),
  [webdashboard/CLAUDE.md](../../../webdashboard/CLAUDE.md).

## Goals

1. **Every machine can be updated without a visit.** A machine pulls its
   target version from our server; nothing connects into the gym's network.
   A machine that was offline catches up when it reconnects.
2. **An update never hurts a customer.** It installs only when the machine
   is idle, and inside the night window unless forced. It never interrupts
   an order or a payment.
3. **A bad release can't take the fleet down.** Releases are signed, go to a
   test machine first and roll out in stages. A machine that isn't healthy
   after an update switches back by itself, and the rollout pauses.
4. **Staff can see and steer it.** Each machine's app, bridge, firmware and
   OS versions and its update history are on its dashboard page (staff
   only); staff publish, promote, pause and withdraw releases and can force
   an update on one machine or on a release's targets.

## How it works (summary)

```
release Mac ──make_release.sh──▶ signed bundle ──upload──▶ server (Releases, rollout stages)
                                                               │  GET /fuelbot/update (every 5 min)
                                                               ▼
Pi: fuelbot-updater ── download, verify ──▶ /opt/fuelbot/releases/<version>/
        │  idle? window or forced? ──▶ "Updating" screen ──▶ switch `current` ──▶ restart bridge + app
        └─ healthy within 5 min? yes → report healthy │ no → switch back, report rolled_back
```

- **A release bundle** (OTA-03) is a `.tar` with `manifest.json`, its
  signature, `fuelbot.pck`, the bridge, and the Godot engine binary only
  when the Godot version changes. A typical release is about 10 MB; an
  engine change adds about 25 MB (to be measured on the first arm64
  export).
- **On the Pi** (OTA-04, OTA-08) each version lives in
  `/opt/fuelbot/releases/<version>/`, complete (engine, `.pck`, bridge), and
  `/opt/fuelbot/current` is a symlink to the running one. The systemd units
  run from `current`. Switching is an atomic rename of the symlink. The
  machine's own data stays in `user://`, outside the releases.
- **The server** (OTA-05) decides each machine's target version from the
  release's rollout stage, the machine's pin, and staff's "Update now".

## Execution order

| # | Story | Depends on | Produces |
|---|-------|-----------|----------|
| 01 | [Versions on the machine](OTA-01-versions.md) | — | app / bridge / firmware versions known, shown on maintenance, sent to the server; firmware `STATUS:BOOT v<n>` |
| 02 | [Runtime state and safe restart](OTA-02-runtime-state.md) | 01 | `user://runtime_state.json`, the restart request, the "Updating" screen (a local fault), the "writes only under `user://`" check |
| 03 | [Release bundle and signing](OTA-03-release-bundle.md) | 01 | arm64 export preset (`.pck` separate), `tools/make_release.sh`, `manifest.json`, Ed25519 signature, `tools/verify_release.sh` |
| 04 | [The updater](OTA-04-updater.md) | 02, 03 | `deploy/updater/fuelbot_updater.py`: check, download, verify, wait for idle and window, switch, health check, rollback, report |
| 05 | [Server: releases, rollout, update API](OTA-05-server.md) | 01 | versions on the machine record, `Release` / `UpdateEvent`, `/fuelbot/update`, `/fuelbot/update/report`, release files, admin API, audit |
| 06 | [Dashboard: software and releases](OTA-06-dashboard.md) | 05 | a machine's Software panel (versions, history, Update now, pin), fleet versions, the Releases page |
| 07 | [System steps and the USB stick](OTA-07-system-steps-usb.md) | 04 | signed system steps (OS updates, settings), the USB rescue release and `wifi.txt` |
| 08 | [On the Pi image](OTA-08-pi-image.md) | 04, 07, Milestone 8 | `/opt/fuelbot` layout, systemd units, the public key, provisioning that installs the first release |
| 09 | [End-to-end and sign-off](OTA-09-e2e-signoff.md) | 01–08 | bench runs on a real Pi, SIGNOFF.md, runbook, plan / README / CLAUDE.md updates |

01–03 are small and unblock the rest. 04 is tested against a fake server
that follows the contract in server plan §3.8–3.10, so it doesn't wait for
05. 05 and 06 can be built and tested locally before hosting is decided;
running OTA for real needs the server deployed.

## Definition of Done (every story)

Per area, as in the existing sets:

- **Kiosk, bridge, firmware, tools:** `tools/run_tests.sh` → `ALL TESTS
  PASSED`, `tools/check_boot.sh` → `BOOT OK`, the Python tests → `OK`
  (`python3 -m unittest mockserver/test_server.py
  hardware/bridge/test_udprxtx.py tools/test_fakes.py
  hardware/firmware/test_firmware.py`, plus `deploy/updater/test_updater.py`
  from OTA-04), `tools/check_firmware.sh` when the sketch changes, and a
  screenshot that's looked at for UI changes.
- **Server:** `cd server && npm test`.
- **Dashboard:** the gate in [webdashboard/CLAUDE.md](../../../webdashboard/CLAUDE.md)
  (lint, unit, build, e2e at three widths), screenshots looked at.
- One commit per story, `OTA-NN: <title>`, chained with `&&` after the
  checks; files staged explicitly. No key of any kind (machine key, signing
  key, Razorpay) in a commit, log or screenshot.

## Decisions

Made by the product owner (2026-10-08 and 2026-10-09):

1. **The Raspberry Pi stays the platform; no Android tablet.** The Play
   Store can't guarantee an update never lands mid-order (a kiosk fleet
   would need an MDM anyway), and Android would mean rewriting the bridge
   (USB serial inside a Godot Android plugin) and its test rig. A different
   tablet can be revisited later as a hardware decision; Godot exports to
   Android.
2. **Our own updater, pulling signed releases from our server.** Machines
   only make outgoing HTTPS calls, authenticated with the machine key they
   already have.
3. **When it installs:** only when the machine is idle; between **02:00 and
   05:00** in the display time zone (IST), with a per-machine override; a
   machine that has waited **7 days** installs at its first idle moment. **A
   staff member can force an update from the dashboard** (one machine, or a
   release's current targets): it skips the window and still waits for
   idle. Switching maintenance on first makes a forced update start as soon
   as the current order (if any) ends.
4. **Arduino firmware is not updated over the air in the first version.**
   The firmware reports its version (`STATUS:BOOT v<n>`) so staff can see
   it; flashing stays on site until the first real AVR compile and a bench
   test of flashing from the Pi with `avrdude`. The bundle format leaves
   room for it.
5. **Release files are hosted by the API server's own storage.** The S3
   bucket is left out (server S5, deferred).
6. **No remote access for now** (no Raspberry Pi Connect, Tailscale or SSH
   from outside). Consequences: the updater is the only remote way in, so
   rollback and the boot-loop guard must be robust, and a machine it can't
   fix gets a site visit, helped by the **USB rescue stick** (OTA-07).
   Remote access can be added later through a signed system step.
7. **No read-only system disk.** The Pi runs Raspberry Pi OS as usual. OS
   updates are still a deliberate, staged step (OTA-07), not automatic.
   Instead of read-only: a good power supply, a high-endurance SD card or
   an SSD, fewer writes (capped journal, no disk swap), and a spare card per
   site with the machine's identity restored from a USB stick. Turning
   read-only on later means re-imaging (there's no spare partition).
8. **Only FuelBot staff with `releases:manage` (platform admins) publish
   releases**; one person can publish; every step is audited. **Tenants
   never see versions or updates** (platform-only data, like telemetry).
9. **Rollout:** a named test machine first, then staff promote to 10 %, then
   to everyone. **A rollout pauses itself** when any machine reports a
   rollback or a failure.
10. **Building and signing:** releases are built on one designated Mac by a
    named person. The Ed25519 signing key is kept offline (a password
    manager or a hardware key) with a backup, never in the repo; the
    public key is baked into the Pi image. The runbook (OTA-09) says how to
    replace a lost or leaked key.
11. **One version per release** (`1.4.0`), which is the app's version
    (`application/config/version`); the manifest also lists the bridge's
    and the firmware's versions. Shown on the maintenance screen and on
    staff pages.
12. **This set is planned now and built with Milestone 8,** so the first
    deployed machines already have the updater.

Made while writing this set:

13. **The `.pck` ships separately from the engine** ("Embed PCK" off). The
    engine binary ships only when the Godot version changes, and a release
    folder on the Pi is always complete (the updater copies the engine from
    the current release when the bundle has none), so rolling back never
    depends on another folder.
14. **The "Updating" screen is the maintenance screen** with a new local
    fault code, `UPDATING` (message "Updating, back in a minute"), so idle
    enforces it like any other fault and nothing new is needed in scenes.
15. **Health = the new version reached idle, talks to the bridge, and (when
    the server is reachable) fetched its config.** The app records these in
    `user://runtime_state.json`; the updater reads it (it can't listen on
    4246, which the app owns). If the server is unreachable at that moment,
    the local checks decide and the server confirmation follows later.
16. **Signatures are checked with the OpenSSL 3 command line** (in Raspberry
    Pi OS), so the updater stays standard-library Python like the bridge.
    The release Mac signs with OpenSSL 3 from Homebrew (macOS's bundled
    LibreSSL is not used).
17. **System steps are scripts run as root, signed like everything else,**
    with Raspberry Pi Connect's exit-code convention: 0 done, 1 failed, 2
    done but reboot. OS updates install exact package versions tested on the
    test machine, so the fleet gets what was tested.

## Out of scope (this set)

- Flashing the Arduino over the air (decision 4).
- Remote access (decision 6) and a read-only system disk (decision 7).
- A/B whole-system images, delta downloads, Godot patch packs.
- Automatic promotion between rollout stages (staff promote by hand).
- Tenant-visible versions or update controls.
- Pushing from the server (machines pull every 5 minutes).

## Sign-off

`SIGNOFF.md` is created and filled in by OTA-09.
