# Kiosk API & machine identity — story set (Milestone S1)

The three endpoints the kiosk calls, served from real data: a machine's
config built from its tenant, menu and products; telemetry and sales stored
without ever losing a record. The app learns its machine id and keeps
records the server refuses for identity reasons.

- Plan: [server-plan.md](../../plans/server-plan.md) §3 (the contract, all
  of it), §4.1 (models), §4.2, §4.5 (health), §6 S1, §7 contract tests 1–3.
- Conventions: [server/CLAUDE.md](../../../CLAUDE.md); for the app story,
  the root [CLAUDE.md](../../../../CLAUDE.md).

## Execution order

| # | Story | Depends on | Produces |
|---|-------|-----------|----------|
| 01 | Models & catalog | S0 | `Tenant`, `Product`, `Machine`, `Sale`, `TelemetryEvent` (strict); `catalog/validate.js` (the app's rules, same error text), `catalog/build.js` (→ config body); `services/catalog.js` + model hooks. (`catalog/input.js`, the raw checks for admin request bodies, comes with those requests in S3) |
| 02 | Config endpoint, seed & import | 01 | identity middleware; `GET /fuelbot/config`; last seen; `scripts/import-config.js` (app config JSON → products + machine menu); `npm run seed` |
| 03 | Telemetry & sales ingest | 02 | `POST /fuelbot/telemetry`, `POST /fuelbot/sales`: dedupe, `extra`, header truth, unregistered machines, health |
| 04 | App: machine identity | 02 | `user://machine_id.txt`, `X-Machine-Id`, `machine_id` on records and QR notes, `ReportQueue` keeps 401/403, `dev_setup.gd --machine=`, diagnostics, tests |
| 05 | End-to-end & sign-off | 01–04 | the dev app against the real server; `SIGNOFF.md`; docs |

## Definition of Done (every story)

`cd server && npm test` → all pass. Story 04 also: `tools/run_tests.sh` →
`ALL TESTS PASSED`, `tools/check_boot.sh` → `BOOT OK`, timing-sensitive
tests re-run. One commit per story (`SRV-NN: <title>`), chained with `&&`
after the checks.

## Decisions

1. **`validate.js` is a line-by-line port of `ConfigManager.validate_config()`
   and `is_valid_image_url()` / `image_file_name()`**, with the same error
   strings, so the dashboard can show exactly what the app would log. A
   test runs the mock's `invalid_duplicate_hopper` scenario through it and
   compares the text.
2. **Machine auth is a pass-through in S1.** The `MACHINE_AUTH` setting
   exists, but keys arrive in S4. Until then every mode behaves like `off`,
   and the middleware slot is already in the pipeline.
3. **Identity:** missing `X-Tenant-Id` or `X-Machine-Id` → 401
   `machine_unidentified` on every kiosk route. A machine registered to a
   *different* tenant counts as unknown (404 on config; stored with
   `machine_known: false` on ingest). A disabled machine or tenant → 403.
4. **Import splits an app config into the model**: `tenant.display_name` /
   `logo_text` / `support_phone` → tenant branding; `location_label` /
   `site` → machine; each flavor → a product (text, image, default prices)
   plus a menu item (hopper, badge, sold out, enabled); `bases`,
   `maintenance`, `idle_video_url` → machine. It validates the raw config
   first. Re-importing updates in place. The round trip (import, then GET)
   reproduces the mock's `default` body exactly (contract test 1).
5. **Seed** = import the mock's `default.json` as tenant `powerfuel`
   ("PowerFuel Gym"), machine `machine-042` (`DEV00001` since S3: ids are generated), with its `{{origin}}` image
   URLs **removed** (the dev server has no such images; the bundled `image`
   remains). S5 brings real image uploads.
6. **Health on ingest** follows plan §4.5. A health event older than
   `health.last_event_at` is stored but doesn't change health.
7. **The app's dev defaults** become tenant `powerfuel`, machine
   `machine-042` (`DEV00001` since S3). The mock ignores `X-Machine-Id`, so app tests are
   unaffected.
