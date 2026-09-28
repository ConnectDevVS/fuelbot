# SRV-39: Sales summary (filters, day / week / month, breakdowns)

**As an** owner (or staff), **I want** to pick a period and see revenue,
orders and not-dispensed sales by day, ISO week or month, by flavor and by
machine, **so that** I can review the business at the grain I plan it.

- **Refs:**
  - product owner: day/week/month required; charts revenue + flavor mix;
  - SP §4.9 (summary, filters, `group=tenant` platform-only);
  - read-apis decisions 1–5;
  - DP §5.7 (+ wireframe), §2.10 (ranges in `display_tz`);
  - mock-up `design/sales-filters-phone.png` (the phone filter sheet).
- **Depends on:** SRV-27 (week/month), SRV-37 (charts).

## Deliverables

1. `src/pages/sales/SalesPage.jsx`: the tabs "Overview | Not dispensed";
   this story builds Overview's upper half.
2. `src/pages/sales/filters.js`: filter state ⇄ URL query. Presets → `{from,
   to}` in `display_tz` as offset ISO strings; the default group per range.
3. `src/pages/sales/SalesFilters.jsx`: one row on desktop, a "Filters (n)"
   sheet on phone.
4. `src/pages/sales/SalesKpis.jsx`, `BreakdownTable.jsx`.
5. Routes:
   - `/t/:tid/sales` (`sales:read`);
   - `/sales` for staff (all tenants: a `tenant` filter select; the
     breakdown by tenant; the flavor chart replaced by "Pick a tenant to
     see flavors").

## Spec

- **Filters:**
  - period presets per DP §5.7 (default Last 30 days) + a custom range
    (date inputs, inclusive end day → `to` = the next day's 00:00);
  - Group Day | Week | Month;
  - Machine (`useMachineNames`), Flavor (`useFlavorNames`), Dispensed
    (All / Dispensed / Not dispensed → `dispensed=true|false`);
  - staff: Tenant, Result (`result=`). Result is shown only with
    `telemetry:read`, since the server refuses it for others with 400
    `unknown_filter`.
- **API:** three summaries with the same filter params, debounced 300 ms:
  - `group=<day|week|month>` (chart + totals);
  - `group=flavor`;
  - `group=machine` (or `group=tenant` for staff on all tenants).
- **KPIs from `totals`:**
  - Revenue;
  - Orders;
  - Avg (`round(revenue / count)`, "—" at 0);
  - Not dispensed (`not_dispensed` + ₹ `not_dispensed_amount`). The tenant
    wording is always "Not dispensed".
- **Breakdown tables:** key → name, orders, revenue, share % (of the
  totals' revenue), not dispensed n / ₹. Sorted as the server returns
  them (by revenue).
- **URL:** the filters live in the query string (shareable, back-button
  safe). `display_tz` from `/auth/me` is used for every range.

## Acceptance criteria

- [ ] `src/pages/sales/filters.test.js`:
      - "presets produce IST day bounds" (Last 7 days on 2026-09-28 →
        `from=2026-09-22T00:00:00+05:30`, `to=2026-09-29T00:00:00+05:30`);
      - "This month / Last month";
      - "custom end day is inclusive";
      - "URL round-trip";
      - "default group by range length".
- [ ] `e2e/sales-summary.spec.js` › "totals match the API for each group":
      Day/Week/Month KPIs are equal (the same totals), and the bucket
      counts equal the filled bucket keys.
- [ ] `e2e/sales-summary.spec.js` › "week grouping shows ISO week labels
      and splits at Monday 00:00 IST": the seeded straddling sales fall in
      two weeks.
- [ ] `e2e/sales-summary.spec.js` › "filters narrow every block": machine
      = `E2E00002` → the by-machine table has 1 row; Not dispensed → the
      KPIs equal 9 / ₹… from the seed.
- [ ] `e2e/sales-summary.spec.js` › "tenant users have no Result filter or
      tenant breakdown"; "staff all tenants shows By tenant and the
      'Pick a tenant' note".
- [ ] `e2e/sales-summary.spec.js` › "limited operator's Machine select
      lists only DEV00001".
- [ ] Screenshots: overview (owner, staff all tenants), the phone filter
      sheet, 3 sizes. Looked at.

## Out of scope

The sales table, CSV, Not dispensed, order detail and print (SRV-40), and
comparing to the previous period.
