# Read APIs — sign-off (Milestone S6)

**Date:** 2026-09-27. **Branch:** `server-backend`. **Result: PASS.**

## Automated (`cd server && npm test`: 158 / 158)

| Area | Covered |
|---|---|
| Scope & filters | tenant / machine filters outside the caller's scope are 404; bad dates and cursors 400; newest first by client time with a `(ts, _id)` cursor |
| Days | `DISPLAY_TZ` days: 26 Sep 19:00 UTC is 27 Sep in `Asia/Kolkata` (summary and `dayKey`) |
| Fleet | platform: every machine, full status (fault / ok / offline), per-tenant counts; tenant users: their machines, no platform-only fields, no tenant summary; today's count / revenue / not dispensed / last sale |
| Sales | scoped lists (platform, tenant, limited operator); tenant view has `dispensed` and never the result, reason, `extra`, `machine_known` or body ids; filters incl. platform-only `result`; cursor pages; summary by day / flavor / machine / tenant (platform only) with totals; CSV in the caller's view, formula-injection guard |
| Telemetry | platform only; type / machine / order filters |
| Faults | intervals rebuilt from health events (open, already-open, `machine_ok` without a code, `BRIDGE_DOWN`), `from` / `to`; platform only |
| Orders | the sale in the caller's view, telemetry for platform only; another tenant's or machine's order 404 |
| RBAC table | 27 routes × 4 roles |

## Live check

`npm run db`, `seed`, `create-admin`, `npm start`; two sales posted with the dev
key (one `timeout`); then, as the platform admin: `/fleet` showed DEV00001
`ok` with today = 2 sales, ₹255, 1 not dispensed (₹180); `/sales/summary?group=flavor`
the same split by flavor; `/sales/export.csv` downloaded as
`sales-2026-09-27.csv` with both rows; `/orders/<id>` returned the sale.
