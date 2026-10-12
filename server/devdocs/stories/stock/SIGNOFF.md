# Estimated stock — sign-off (Milestone S6b)

**Date:** 2026-09-27. **Branch:** `server-backend`. **Result: PASS.**

## Automated (`cd server && npm test`: 175 / 175)

| Area | Covered |
|---|---|
| Inputs | `portion_g` set by tenant_admin and platform; operators may send it unchanged only (403 `forbidden_field` otherwise); bounds (0, 600, a string refused); null clears it. `low_portions` per menu item, `stock:write` only, kept across other menu edits. Refills / adjustments: tenant_admin and platform only, hopper must be on the menu, level bounds, audited; history newest first, by hopper, scoped |
| Estimate | only cycles that dosed (`PROTEIN_DISPENSED`) this hopper on this machine after the refill count (not before it, not failed-early cycles, not other hoppers or machines); 2000 − 3 × 32.5 g → 58 portions; days left from the last 7 days; never negative |
| States | low, empty, unknown (never refilled), not estimated (no portion size), refill needed (another product on the hopper since the refill); an adjustment resets the count; a per-hopper threshold overrides the default |
| Fleet list | non-ok hoppers by default, most urgent first, `state=` filter, scoped (limited operator sees only their machine), unconfigured machines skipped, bad state 400 |
| RBAC table | 32 routes × 4 roles, incl. the stock routes |

## End-to-end: the real app

Server, mock (Razorpay), fake bridge, app provisioned for the server. Through
the admin API (platform admin): guava `portion_g` 32.5, guava's
`low_portions` 29, then a refill of hopper 1 to 1000 g.

| # | Step | Result |
|---|---|---|
| 1 | Before the refill | **PASS**: guava `unknown` |
| 2 | After the refill | **PASS**: `ok`, 1000 g, 30 portions, 0 doses |
| 3 | Two guava orders through the app (`ORDER … P1 B2` → `DONE`, sale + `dispense_cycle` each) | **PASS**: both delivered (queues 0) |
| 4 | The estimate | **PASS**: `low`, 935 g (1000 − 2 × 32.5), 28 portions, 2 doses, 98 days left |
| 5 | Refill-soon list (`/api/v1/stock?state=low,empty`) | **PASS**: `DEV00001/h1 guava low (28)` |

## Also in this milestone's commits

- **Test infrastructure:** a rare `404 {}` on sign-in was a request reaching
  another process: supertest's per-request server listened on every
  interface, and a parallel test file's `mongod` held `127.0.0.1` on the same
  port. `startServer()` now listens once per file on `127.0.0.1`. The first
  occurrence (during SRV-22) couldn't be reproduced at the time; the second
  (SRV-24 gate) was captured and diagnosed. Clean since.
- **Hardening (SRV-21–23):** the seed refuses `NODE_ENV=production`;
  sign-out revokes that session on the server (`revoked_sessions`, TTL);
  the kiosk docs no longer say the backend doesn't exist.

## Known limitation

Refills are stamped with server time and doses with the machine's clock
(plan §4.13, "Clocks"); a machine clock that's off shifts which doses count.
