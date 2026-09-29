# Web dashboard: sign-off (Milestone S7)

**Status: in progress — not signed off.** The automated part of SRV-49 is
done (desktop). Two things remain before S7 can be signed off:

1. **The phone and tablet pass.** From SRV-42 the product owner asked for
   desktop first (2026-09-29; DP §0.1 row 3): SRV-42–48 pages are designed
   and checked at 1440 only, and their specs, the walkthrough and the leak
   scan run on the desktop project. SRV-27–41 stay checked at all three
   widths.
2. **The real-app run** (steps 1–6 below): it launches the kiosk app, so it
   waits for a session with the product owner.

**Date:** 2026-09-29. **Branch:** `s7-dashboard` (not pushed). **Result:** —.

## Automated

| Suite | Command | Result |
|---|---|---|
| Server | `cd server && npm test` | PASS, 200 tests |
| Dashboard unit | `cd webdashboard && npm test` | PASS, 89 tests |
| Lint + build | `npm run lint && npm run build` | PASS |
| Browser | `npm run e2e` | PASS, 228 passed + 135 skipped (desktop-only specs skip on phone / tablet), twice in a row |
| Leak scan (tenant roles × pages) | `e2e/leak-scan.spec.js` | PASS (desktop): owner, ops, desk, look, boss |
| Kiosk untouched | `tools/run_tests.sh && tools/check_boot.sh` | PASS: 220 tests, BOOT OK |

The leak scan walks every page a tenant role's navigation offers, every tab
of its first machine, an order and a product, and checks every JSON
response for platform-only keys (`maintenance`, `faults`, `status`,
`last_seen_ip`, `health`, `dispensing_result`, `dispensing_reason`,
`machine_known`, `received_at`, `extra`, `body_*`, `telemetry`), every
page's text for fault codes, reasons, "maintenance", IP addresses and
platform nav labels, and that no request goes to `/telemetry`, `/faults`,
`/audit`, `/unregistered` or `…/maintenance`. Globex sees no powerfuel
machine id, order id or name (it found the seed's Globex machine carrying
"PowerFuel Gym / Bay 02" as its site, imported from the default config:
seed data, fixed in the seed).

## Screenshots looked at

Every story's screenshots were looked at when it was built (the commit
messages list what each changed). The SRV-49 walkthrough: 84 desktop
screenshots (6 roles, every page and machine tab), all looked at.

| Area | Anomalies found → fixed (SRV-49 walkthrough) |
|---|---|
| Staff's machine tabs | every tab shot was the loading skeleton: the lazy tab's fallback had no `aria-busy`, so "loaded" was declared early → the tab and page fallbacks now say they're busy, and the shots show the tabs |
| All users (staff) | a FuelBot admin showed "All machines" → "—" (not limited to machines at all) |
| Staff Telemetry | tenant · machine and order ids wrapped onto two lines → nowrap; the page had no date overline → added (as on Audit) |

## Role walk-through (desktop)

| Role | Account | Pages walked | Result |
|---|---|---|---|
| platform_admin | staff@fuelbot.test | 23 | PASS |
| tenant_admin | owner@powerfuel.test | 14 | PASS |
| operator (all machines) | ops@powerfuel.test | 11 | PASS |
| operator (limited) | desk@powerfuel.test | 11 | PASS |
| viewer | look@powerfuel.test | 11 | PASS |
| tenant_admin (other tenant) | boss@globex.test | 14 | PASS |

Phone and tablet: pending (see Status).

## End-to-end: the real app (SRV-49 steps)

| # | Step | Result |
|---|---|---|
| 1 | Server + built dashboard + app on the server | pending |
| 2 | Price change and menu override reach the kiosk at restart | pending |
| 3 | Maintenance on/off within ≤ 120 s | pending |
| 4 | An order shows on Home/Sales; stock −1 portion; staff timeline | pending |
| 5 | Timed-out order: "Not dispensed" (tenant), reason (staff) | pending |
| 6 | Register + provision a new machine from the card; it boots with its menu | pending |

The browser tests already cover the dashboard side of steps 2, 3 and 6
against the real server (the kiosk config the machine would fetch, with a
key read from the provisioning card): see `e2e/menu.spec.js`,
`e2e/staff-machine.spec.js`, `e2e/machines.spec.js`.

## Known limitations

- SRV-42–48 pages are desktop-first; the phone and tablet layouts come
  later (product owner, 2026-09-29).
- Not deployed (hosting undecided). A third-party security review is
  recommended before production.
- Refunds for not-dispensed orders are done in the Razorpay dashboard; the
  dashboard lists them and doesn't track refunds (SP §9.6, open).
- Product image upload is S5 (deferred): the dashboard shows the URL's
  image or the bundled file name.
