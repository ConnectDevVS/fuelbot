# SRV-27: Read API additions (week/month, CSV local time, tenant filters)

**As a** tenant owner, **I want** sales by ISO week and by month, and a CSV
with local times, **so that** I can review the business the way I plan it.
**As** the dashboard, **I want** `/fleet` and `/stock` for one tenant,
**so that** staff inside a tenant don't load the whole fleet.

- **Refs:** SP §4.9 (week/month keys, product owner 2026-09-27), SP §4.5,
  SP §4.13; DP §2.6, §5.3, §5.7, §8.1. Spike C.
- **Depends on:** S6b (merged). **Server only.**

## Deliverables

1. `server/src/routes/sales.js`: `GROUPS.week` and `GROUPS.month`.
2. `server/src/routes/sales.js`: a `local_time` column first in both
   `PLATFORM_COLUMNS` and `TENANT_COLUMNS`.
3. `server/src/routes/fleet.js` and `server/src/routes/stock.js`
   (`fleetStockRouter`): a `tenant` query filter.
4. Tests in `server/test/sales-api.test.js`, `server/test/fleet.test.js`,
   `server/test/stock-estimate.test.js`; RBAC rows in
   `server/test/audit.test.js`.
5. Docs: SP §4.9 table (week/month no longer "S7", the `tenant` filter,
   `local_time`), `server/README.md` Reports section.

## Spec

- **Week:** `{ $dateToString: { format: '%G-W%V', date: '$ts', timezone: tz } }`,
  keys `2026-W39`.
- **Month:** `format: '%Y-%m'`, keys `2026-09`.
- **Sorting:** both sort by `_id` ascending (like `day`); `flavor`,
  `machine` and `tenant` stay sorted by revenue.
- **Spike C** proved these on MongoDB 8.2.6 with `Asia/Kolkata`, including
  the ISO-year edges. The strings sort chronologically.
- **The response shape is unchanged:** `{group, tz, items: [{key, count, revenue, not_dispensed, not_dispensed_amount}], totals}`.
- **An unknown group** stays 400 `invalid_group`.
- **`local_time`:**
  - `YYYY-MM-DD HH:MM:SS` of `ts` in `DISPLAY_TZ`, via
    `Intl.DateTimeFormat('en-CA', {timeZone, hourCycle: 'h23', …})`, as a
    helper `localTime(date, tz)` in `services/records.js`;
  - it goes through `csvCell()` like every cell;
  - `ts` (UTC ISO) stays as the second column.
- **`tenant` filter on `/fleet` and `/stock`:**
  - platform: `?tenant=<id>` limits to that tenant; an unknown tenant is
    `{items: []}` (fleet with `tenants: []`), not 404.
  - tenant users: `?tenant=` must equal their own `tenant_id`, else **404
    `not_found`**, the same rule as `scopedFilter` (read-apis decision 1).
  - Implement the check with `canSeeTenant()` from `auth/rbac.js`.
  - For platform, `/fleet`'s `tenants` summary then lists only that
    tenant.
- **Nothing else changes.** The views and the permissions stay as they are.

## Acceptance criteria

- [ ] `sales-api.test.js` › "summary groups by ISO week in DISPLAY_TZ":
      sales at `2026-09-27T18:29:59Z` and `2026-09-27T18:30:00Z` land in
      `2026-W39` and `2026-W40`.
- [ ] `sales-api.test.js` › "ISO week-year edges": `2026-12-31T18:30:00Z`
      → `2026-W53`; `2027-01-03T18:30:00Z` → `2027-W01`;
      `2025-12-29T00:00:00Z` → `2026-W01`; items sorted ascending.
- [ ] `sales-api.test.js` › "summary groups by month in DISPLAY_TZ":
      `2026-09-30T18:29:59Z` → `2026-09`, `2026-09-30T18:30:00Z` →
      `2026-10`; totals equal the day grouping's totals.
- [ ] `sales-api.test.js` › "week and month respect scope and filters": a
      limited operator's week summary counts only their machine;
      `dispensed=false` works with `group=month`.
- [ ] `sales-api.test.js` › "CSV starts with local_time in DISPLAY_TZ": the
      header starts `local_time,ts,`; a sale at `2026-09-28T07:12:02Z` has
      `2026-09-28 12:42:02`, for both the platform and tenant column sets.
- [ ] `fleet.test.js` › "tenant filter": platform `?tenant=powerfuel`
      returns only powerfuel machines and one `tenants` entry;
      tenant_admin `?tenant=powerfuel` → 200, `?tenant=globex` → 404.
- [ ] `stock-estimate.test.js` › "fleet stock tenant filter": the same
      rules for `/api/v1/stock?tenant=`.
- [ ] `audit.test.js` RBAC table: rows `GET /api/v1/fleet?tenant=globex`
      and `GET /api/v1/stock?tenant=globex` → platform 200, others 404.
      (The table's path column takes a query string; the loop passes it
      as is.)
- [ ] `cd server && npm test` passes; the SP §4.9 table is updated.

## Out of scope

`group=hour`, time-of-day heatmaps, and a machine-comparison chart
(product owner: not needed). Any change to the tenant views.
