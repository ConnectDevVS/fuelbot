# Kiosk API & machine identity — sign-off (Milestone S1)

**Date:** 2026-09-26. **Branch:** `server-backend`. **Result: PASS.**

## Automated

| Check | Result |
|---|---|
| `cd server && npm test` | 41 / 41 pass (validation port, import/build round trip, config endpoint, ingest, health, scripts) |
| `tools/run_tests.sh` | `ALL TESTS PASSED` (220), run twice; `--filter=report_queue` re-run |
| `tools/check_boot.sh` | `BOOT OK` |
| Python tests (mock, bridge, fakes, firmware) | 77 OK |

Contract tests (plan §7): 1 (mock `default` round-trips exactly, also over
HTTP), 2 (`invalid_duplicate_hopper` refused with the app's text; a product
change naming the one broken machine), 3 (every event type 201, repeats 200
`duplicate`, missing ids 401, unregistered machine stored with
`machine_known: false`).

## End-to-end: the real app against the real server

Setup: `npm run db`, `npm run seed`, `npm start` (server on :8790); the mock on
:8787 for Razorpay only (scenario `paid`); `tools/fake_dispense_bridge.py
--mode done --delay 3`; `dev_setup.gd --api=http://127.0.0.1:8790/fuelbot
--razorpay-api=http://127.0.0.1:8787` (what `tools/dev_run.sh
--backend=server` now does). A temporary walker scene (not committed) tapped
attract → guava → Proceed and logged each step.

| # | Step | Result |
|---|---|---|
| 1 | Boot with the server's config | **PASS**: `config_source=remote`, tenant `powerfuel`, machine `machine-042`, "PowerFuel Gym", version 2; listing matches the seeded catalog (bundled images, POPULAR, SOLD OUT). `last_seen_at` / `last_seen_ip` set |
| 2 | Order through to dispensing | **PASS**: `ORDER <id> P1 B2` → `DONE`; one sale (`guava`, ₹75, `success`, both ids from the headers, `machine_known: true`) and one `dispense_cycle` (7 stages) stored |
| 3 | Remote maintenance within one poll (10 s in dev) | **PASS**: switched on in the database at 8 s, maintenance screen at ~10 s; switched off at 24 s, idle at ~30 s |
| 4 | Server down mid-order | **PASS**: server stopped after boot; the order completed, sale and telemetry kept ("send failed … will retry", connection refused); after restart both arrived once (201), none lost, none doubled |
| 5 | Unregistered machine (`machine-777`) | **PASS**: config 404 → the app ran from its cache (OFFLINE badge) and sold; the sale stored with `machine_known: false` |

## Found and fixed during the run

1. **`base` in `dispense_cycle` is a number** (the bridge's `B<n>`: `2`), not
   a string. The first event's `base` landed in `extra` (so nothing was lost:
   the safety net worked). `TelemetryEvent.base` is now a Number; plan §3.3
   and §4.1 say so; the test sample uses `2`.
2. **Request log paths** were relative to the router (`POST /telemetry`); they
   now show the full path (`POST /fuelbot/telemetry`).
3. **App: `FlavorImages` cleanup listed a cache folder that didn't exist**
   (engine `ERROR: Couldn't open directory`) when the catalog has no
   `image_url` at all, which the mock never produced but the seeded server
   does. Cleanup now skips a missing folder. Test
   `test_cleanup_without_cache_folder` documents the behaviour; it can't
   detect the engine `ERROR:` line itself (`run_tests.sh` only fails on
   `SCRIPT ERROR`).

## Not covered here (later milestones)

Machine keys (S4), the admin API and dashboard (S2, S3, S7), product images
(S5), read APIs (S6).
