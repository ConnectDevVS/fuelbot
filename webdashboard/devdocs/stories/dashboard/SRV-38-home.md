# SRV-38: Tenant Home

**As a** tenant owner, operator or viewer, **I want** today's revenue and
orders, what wasn't dispensed, how my machines are, recent trends and what
needs refilling on one page, **so that** I know how the business is doing
without digging.

- **Refs:**
  - product owner: tenant users land on Home; no auto-refresh;
  - SP §4.5 (tenant view), §4.9;
  - DP §5.3 (+ wireframe), §2.6;
  - mock-up `design/home-*.png` (the visual reference for this page).
- **Depends on:** SRV-27 (`/fleet?tenant`, `/stock?tenant`), SRV-36
  (shared rows), SRV-37 (charts).

## Deliverables

1. `src/pages/home/HomePage.jsx`, `homeModel.js` (KPI sums from `today`).
2. Components: `KpiTile`, `MachineStatusList` (reused by Machines list in
   SRV-42), `RefillSoonList` (reused by SRV-41).
3. Route `/t/:tid/home` (`machines:read`); the landing for tenant users.

## Spec

- **API** (in parallel on entry and on Refresh):
  - `GET /fleet?tenant=<tid>`;
  - `GET /sales/summary?group=<day|week|month>&tenant=<tid>&from&to` (the
    range per the switch: 14 days / 12 weeks / 12 months);
  - `GET /sales/summary?group=flavor&tenant&from&to` (same range);
  - `GET /stock?tenant=<tid>&state=empty,low,refill_needed` (top 5);
  - flavor names via `useFlavorNames(tid)`.
- **KPIs:**
  - Revenue today: Σ `today.revenue`, subline "n orders · ₹avg";
  - Orders: Σ `today.count`, "last at hh:mm" from the max `last_sale_at`;
  - **Not dispensed:** Σ `today.not_dispensed` + ₹, with a warn surface
    when > 0; "see list →" goes to `/t/:tid/sales?view=not-dispensed` for
    today;
  - Machines: online/total, plus "n out of service" from `!in_service`.
    The tenant view has no reasons, and none are shown.
- **Machines card:** up to 6 rows (name, id, Online/Offline, In/Out of
  service, today ₹ + orders, last seen), then "All machines →".
- **Refill soon:** up to 5 rows (`StockChip`, product, machine · hopper,
  portions/days), then "Stock →".
- **Scoping:** an operator or viewer limited to machines sees their
  machines only. The server scopes it; the UI adds nothing.
- **Staff inside a tenant:** the same page. `StatusBadge` shows the
  platform badge because the data has it.

## Acceptance criteria

- [ ] `src/pages/home/homeModel.test.js` › "sums today across machines;
      average rounds to whole rupees; out-of-service count".
- [ ] `e2e/home.spec.js` › "owner sees today's KPIs matching the API": the
      tiles equal sums over `GET /fleet?tenant=powerfuel`.
- [ ] `e2e/home.spec.js` › "limited operator sees only DEV00001" (the
      machines card has 1 row; the KPIs equal that machine's `today`).
- [ ] `e2e/home.spec.js` › "tenant Home shows no platform data": for
      owner, desk and look, the page text contains none of `HOMING`,
      `fault`, `maintenance`, `timeout`, `no DONE`, `127.0.0.1`, `last_seen_ip`.
      (SRV-49 repeats this for every page.)
- [ ] `e2e/home.spec.js` › "Day/Week/Month switch changes the range and
      the chart buckets" (14 / 12 / 12 bars).
- [ ] `e2e/home.spec.js` › "Not dispensed tile links to the preset list".
- [ ] `e2e/home.spec.js` › "empty tenant": `boss@globex.test` after a
      reset with globex sales removed → "No sales in the last 14 days",
      and no chart errors.
- [ ] Screenshots: Home for owner and desk, 3 sizes, compared
      with `design/home-*.png`. Looked at.

## Out of scope

Customising the Home layout, and targets or goals.
