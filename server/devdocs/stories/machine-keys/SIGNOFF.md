# Machine keys — sign-off (Milestone S4)

**Date:** 2026-09-27. **Branch:** `server-backend`. **Result: PASS.**

## Automated

| Check | Result |
|---|---|
| `cd server && npm test` | 136 / 136 |
| `tools/run_tests.sh` | `ALL TESTS PASSED` (220), incl. the new machine-key grep (verified to flag `print(… machine_key)` and pass `machine_key_path`) |
| `tools/check_boot.sh` | `BOOT OK` |

Server tests: key format (20 characters, groups of four, no `0 O 1 I L`),
typing variations match (case, spaces, dashes); issue (shown once) / list
(never the key or hash) / revoke (idempotent) for tenant_admin+ only;
**required** (default): no key 401 `machine_key_required`, right key 200,
wrong / another machine's / revoked / unregistered 401 `machine_key_invalid`,
refused ingest stores nothing; a disabled machine reveals nothing without its
key; optional and off modes; `last_used_at`; no key in logs or the audit;
the seed issues the dev key once. App tests: the key header (trimmed), none
when absent, the key file sandboxed.

## End-to-end: the real app with keys required

Server with `MACHINE_AUTH=required` (default); the app provisioned by
`dev_setup.gd` (dev key for `DEV00001`); mock for Razorpay; fake bridge.

| # | Step | Result |
|---|---|---|
| 1 | Boot with the dev key | **PASS**: `source=remote`, online |
| 2 | Order, with the key revoked through the API at ~9 s | **PASS**: sale and `dispense_cycle` got 401 and **stayed queued** ("backend refused this machine … will retry"); config polls 401 → offline; nothing stored on the server |
| 3 | Issue a new key through the API; type it into `machine_key.txt` (lowercase, spaces instead of dashes); restart | **PASS**: config 200, both queued records delivered once (queues 0); the sale is on the server with `machine_known: true` |
| 4 | The key in any log | **PASS**: 0 occurrences in the app and server logs |

## Note

The seed prints the fixed dev key (`DEVK-EYDE-VKEY-DEVK-EY01`); it's a dev-only
constant, documented as such. Real keys are only ever shown once, in the
issue response.
