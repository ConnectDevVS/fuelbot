# Web dashboard: sign-off (Milestone S7)

**Status: signed off (2026-09-30).** Every page for every role works at
phone (390), tablet (820) and desktop (1440) widths; the leak scan passes
at all three; the real-app run passed all six steps. SRV-42–48 were built
desktop first (product owner, 2026-09-29; DP §0.1 row 3) and got their
phone and tablet layouts in the pass below (SRV-49 part 2). Left out on
purpose: the S3 bucket and image upload (S5, deferred; product owner,
2026-09-30).

**Date:** 2026-09-30. **Branch:** `s7-dashboard` (not pushed). **Result:** PASS.

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

## Role walk-through (desktop; phone and tablet below)

| Role | Account | Pages walked | Result |
|---|---|---|---|
| platform_admin | staff@fuelbot.test | 23 | PASS |
| tenant_admin | owner@powerfuel.test | 14 | PASS |
| operator (all machines) | ops@powerfuel.test | 11 | PASS |
| operator (limited) | desk@powerfuel.test | 11 | PASS |
| viewer | look@powerfuel.test | 11 | PASS |
| tenant_admin (other tenant) | boss@globex.test | 14 | PASS |

The same walk passes on phone (the tab bar + More sheet give the same
pages) and tablet: see "Phone and tablet" below.

## Phone and tablet (SRV-42–48, 2026-09-30)

The desktop-only skips came off every spec: all 14 story specs, the
walkthrough and the leak scan run at 390, 820 and 1440. The walkthrough's
168 phone and tablet screenshots and every story spec's phone and tablet
shots were looked at (contact sheets), against the mock-ups where there
is one (`provisioning-phone.png`).

| Area | Found → fixed |
|---|---|
| Test harness | the overflow guard compared the page with `window.innerWidth`, which a mobile viewport widens to fit wide content, so a 632 px page passed on a 390 px phone → it compares with the configured width, and every `shot()` checks too (the guard only saw the page a test ends on) |
| Provisioning card (phone) | the three values printed one character per line (a fixed 180 px label column squeezed the value to nothing) → one column as in the mock-up: file name, value (ids 22 px), Copy under it; the key's five groups on one line at 19 px without dashes, groups never break; Done full width. Tablet: the file name above, Copy beside |
| Register (phone) | the steps took half the screen → small steps |
| Menu tab | phone and tablet showed the desktop table cut off after Hopper / Price (the rest in a sideways scroll) → a card per item on a phone (handle and 44 px ↑/↓ on the left, fields stacked with their own labels), two lines per item on a tablet |
| Bases tab (phone) | the rows made the page 632 px wide → two lines per base, labelled |
| Maintenance tab (phone) | while on, Update and Switch off sat side by side, 473 px wide → they wrap; the fault code column narrows |
| Staff Faults, Telemetry, Audit, a machine's Telemetry (phone) | the filters wrapped into a jumble of half-width controls → `FilterBar`: "Filters (n)" and a sheet with one control per line, Reset and Show results (as on Sales); the staff Telemetry page has one filter group, not two |
| Machines list (tablet) | Location squeezed onto four lines → desktop only (table priority 4); "6 items" on one line |
| Users (tablet) | emails broke mid-word ("new@powerfuel.tes / t") → they wrap after the @; Last sign-in desktop only |
| Products (phone) | an empty STATUS pair on every active product's card → a card leaves empty values out; the search full width (Machines, Users' tenant filter too) |
| Tenants (phone) | small Open / Disable buttons on the cards → full size |
| Product drawer (phone) | the shot caught the sheet mid-slide (the spec waited for a right edge) → the spec waits for the bottom sheet |

Checked and fine as they were: Settings, Config, Keys, Sales and Stock
tabs; Company; the user, new-tenant, copy-menu, record-level, conflict and
confirm dialogs; the order page; Unregistered and All users.

## End-to-end: the real app (SRV-49 steps)

Run on 2026-09-29 with the dev database (`npm run db`, `npm run seed`), the
built dashboard served by `npm start` (:8790), the kiosk app on the server
(`tools/dev_run.sh --backend=server`, dev poll 10 s), the mock for Razorpay
(payments scenario `paid`) and `tools/fake_dispense_bridge.py`. The
dashboard was driven headless (Chromium, 1440 × 900) as a new tenant_admin
of powerfuel and a new platform_admin. The kiosk was driven by a temporary
walker scene (real flow: attract → first card → Proceed → pay; screen
logged and captured on every change) and captured with `DevCapture`.

| # | Step | Result |
|---|---|---|
| 1 | Server + built dashboard + app on the server | PASS: `/dashboard/` 200; the kiosk logged `loaded remote config for tenant powerfuel`; the machine showed Online, "Last seen just now" |
| 2 | Price change and menu override reach the kiosk at restart | PASS: Products → guava ₹95, offer ₹79 → after a restart the kiosk lists guava at **₹79**. Menu tab → override ₹85 / ₹69 → after a restart **₹69** (the override wins) |
| 3 | Maintenance on/off within ≤ 120 s | PASS: switched on 18:38:58 → kiosk Out of service 18:39:01, with the staff message and "Flagged by" in its diagnostics; off 18:39:34 → idle 18:39:41. (Dev polls every 10 s; production's 120 s wasn't exercised, the dialog says "within about 2 minutes") |
| 4 | An order shows on Home/Sales; stock −1 portion; staff timeline | PASS: order 212 (guava, ₹69 charged) → bridge `ORDER … P1 B2` → DONE → the sale on the server. Home: ₹69, 1 order, Bay 02 "₹69 · 1 order". Sales: order 212 Dispensed. Stock tab: hopper 1 **28 → 27 portions** (935 → 902.5 g). Staff's order page: Result success and the stage timeline (WATER_FILL_1_DONE … DONE, total 5.0 s); the owner's order page shows none of those |
| 5 | Timed-out order: "Not dispensed" (tenant), reason (staff) | PASS: order 213 with the bridge in `--mode timeout` → kiosk "We're sorry" → sale `timeout deadline`. Owner: Not dispensed (1) lists it with no result or reason; order page "Not dispensed" only. Staff: `TIMEOUT · DEADLINE`, Result timeout / Reason deadline, the cycle up to MIX_DONE |
| 6 | Register + provision a new machine from the card; it boots with its menu | PASS: Machines → Register "Bay 07" → menu copied from DEV00001 → key issued; the card's three values (tenant `powerfuel`, machine `YVTUCNV0`, key) went into `dev_setup.gd`. Prymor Electro turned off on Bay 07's menu. Restart → the kiosk header reads FUELBOT · BAY 07 and lists five drinks (no Electro, guava at the copied ₹69); the dashboard shows Bay 07 as seen |

Afterwards: guava back to ₹90 / ₹75 with no override, dev provisioning
restored (`dev_setup.gd`, DEV00001), every process the run started
stopped. Bay 07 and the two run accounts stay in the local dev database.

Seen during the run, none of them failures:
- The mock always "captures" ₹75 (7500 paise), so the kiosk warned
  `captured 7500 paise, expected 6900` for the ₹69 orders and dispensed as
  designed.
- Staff's All sales lists machine and flavor ids (`DEV00001`, `guava`), a
  tenant's Sales list names ("FUELBOT · BAY 02", "Prymor Guava").
- `/dashboard/t/<tenant>` (no page) shows Not found; it could go to Home.
- Home's Refill soon is empty while hoppers 2–6 are "Not estimated": as
  designed (`state=empty,low,refill_needed`, DP §5.3).

## Known limitations

- Not deployed (hosting undecided). A third-party security review is
  recommended before production.
- Refunds for not-dispensed orders are done in the Razorpay dashboard; the
  dashboard lists them and doesn't track refunds (SP §9.6, open).
- Product image upload and the S3 bucket are S5 (deferred, left out of
  this sign-off): the dashboard shows the URL's image or the bundled file
  name.
