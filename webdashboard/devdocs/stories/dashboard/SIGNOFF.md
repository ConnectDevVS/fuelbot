# Web dashboard: sign-off (Milestone S7)

**Status: not started.** SRV-49 fills this in. The structure is fixed now
so the evidence has a place.

**Date:** —. **Branch:** —. **Result:** —.

## Automated

| Suite | Command | Result |
|---|---|---|
| Server | `cd server && npm test` | — |
| Dashboard unit | `cd webdashboard && npm test` | — |
| Lint + build | `npm run lint && npm run build` | — |
| Browser (3 sizes × 2 themes) | `npm run e2e` | — |
| Leak scan (tenant roles × pages) | `e2e/leak-scan.spec.js` | — |
| Kiosk untouched | `tools/run_tests.sh && tools/check_boot.sh` | — |

## Screenshots looked at

| Area | Count | Anomalies found → fixed |
|---|---|---|
| Sign-in, change password | — | — |
| Shell & nav (per role) | — | — |
| Fleet, Home | — | — |
| Sales, Not dispensed, order, print PDF | — | — |
| Stock, refill soon | — | — |
| Machines, register, provisioning card, keys | — | — |
| Menu, config, settings, bases | — | — |
| Products, users, company | — | — |
| Staff pages | — | — |

## Role walk-through

| Role | Account | Pages walked | Result |
|---|---|---|---|
| platform_admin | staff@fuelbot.test | — | — |
| tenant_admin | owner@powerfuel.test | — | — |
| operator (all machines) | ops@powerfuel.test | — | — |
| operator (limited) | desk@powerfuel.test | — | — |
| viewer | look@powerfuel.test | — | — |
| tenant_admin (other tenant) | boss@globex.test | — | — |

## End-to-end: the real app (SRV-49 steps)

| # | Step | Result |
|---|---|---|
| 1 | Server + built dashboard + app on the server | — |
| 2 | Price change and menu override reach the kiosk at restart | — |
| 3 | Maintenance on/off within ≤ 120 s | — |
| 4 | An order shows on Home/Sales; stock −1 portion; staff timeline | — |
| 5 | Timed-out order: "Not dispensed" (tenant), reason (staff) | — |
| 6 | Register + provision a new machine from the card; it boots with its menu | — |

## Known limitations

—
