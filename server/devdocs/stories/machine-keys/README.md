# Machine keys — story set (Milestone S4)

Only a real, provisioned machine can fetch its config or post sales and
telemetry. Each machine gets keys issued through the admin API, typed into
the machine by a technician, sent by the app on every backend call, and
required by the server from the start.

- Plan: [server-plan.md](../../plans/server-plan.md) §0 (2026-09-27 key
  decision), §3.5, §3.7 (S4 app changes), §4.1 (`MachineKey`), §4.3, §4.4
  (machine keys), §6 S4, §7 contract test 4 and end-to-end step 7.
- Conventions: [server/CLAUDE.md](../../../CLAUDE.md); for the app story, the
  root [CLAUDE.md](../../../../CLAUDE.md).

## Execution order

| # | Story | Depends on | Produces |
|---|-------|-----------|----------|
| 15 | Keys on the server | S3 | `MachineKey` model; `services/keys.js` (generate, normalise, hash); enforcement in the kiosk pipeline per `MACHINE_AUTH` (default `required`); `GET/POST …/machines/:mid/keys`, `DELETE …/keys/:kid`; seed key for `DEV00001` |
| 16 | App sends the key | 15 | `user://machine_key.txt` → `Authorization: Bearer` on backend calls only; never logged (static grep in `run_tests.sh`); `dev_setup.gd --machine-key=`; tests |
| 17 | End-to-end & sign-off | 15, 16 | the real app with a key under `required`; revoke → records kept; new key → flushed; SIGNOFF; docs |

## Definition of Done (every story)

`cd server && npm test` → all pass (RBAC table rows for the key routes).
Story 16 also: `tools/run_tests.sh` → `ALL TESTS PASSED`, `tools/check_boot.sh`
→ `BOOT OK`. One commit per story (`SRV-NN: <title>`), chained with `&&`
after the checks.

## Decisions

Product owner (2026-09-27, plan decision log): keys are issued separately
(after registration), typed into the machine by hand, and required from
the start.

Made while writing this set:

1. **Format:** 20 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, drawn
   with `crypto.randomInt`, shown as `XXXX-XXXX-XXXX-XXXX-XXXX`.
   **Normalised** before hashing (uppercase, dashes and whitespace removed),
   so `7kqm 2xpa-…` matches. Stored: SHA-256 hex of the normalised key
   (unique), and `prefix` = its first 4 characters for the UI.
2. **Checked after identity:** the key must belong to the `X-Machine-Id`
   machine (so to its tenant) and not be revoked. No key under `required` →
   401 `machine_key_required`; wrong, revoked or another machine's → 401
   `machine_key_invalid`. Both are kept and retried by the app.
3. **`Authorization: Bearer <key>`** is the only place the key travels.
   The server never logs it, never returns it after issuing, and never puts
   it in the audit log (the audit records the key's id and prefix).
4. **`last_used_at`** is updated at most once a minute per key (best effort).
5. **Routes** (`keys:manage`: tenant_admin and platform_admin): list (id,
   prefix, label, created, created by, last used, revoked), issue (`{label}`
   → the key once), revoke (`DELETE`, idempotent: revoking twice is 200).
   A disabled machine keeps its keys (it's refused as disabled anyway).
6. **Dev:** the seed issues the fixed key **`DEVK-EYDE-VKEY-DEVK-EY01`** for
   `DEV00001` (dev only, like the machine id), and `dev_setup.gd` provisions
   it by default. Tests set `MACHINE_AUTH` explicitly; the key tests cover
   all three modes.
