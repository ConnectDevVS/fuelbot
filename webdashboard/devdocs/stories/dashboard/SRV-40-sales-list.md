# SRV-40: Sales list, CSV, Not-dispensed list, order detail, print report

**As an** owner, **I want** every sale in a table I can export, a work list
of paid orders that weren't dispensed (to refund them by hand in Razorpay),
each order's details, and a printed report, **so that** I can reconcile and
share the numbers.

- **Refs:**
  - product owner: the Not-dispensed work list and print report (extras);
    failed sales shown as "Not dispensed", never the reason, for tenants;
  - SP §4.9 (`/sales`, CSV, `/orders/:id`), read-apis decisions 4 and 6;
    SRV-27 (`local_time`);
  - DP §5.7, §5.8, §5.9 (+ wireframes).
- **Depends on:** SRV-39.

## Deliverables

1. `src/pages/sales/SalesTable.jsx`: cursor pages (`GET /sales?limit=50`
   + filters + `cursor`) with Load more.
2. `src/pages/sales/ExportCsvLink.jsx`: `<a href="/api/v1/sales/export.csv?…" download>`
   built from the current filters (no `limit`/`cursor`).
3. `src/pages/sales/NotDispensedTab.jsx`: `?view=not-dispensed`,
   `dispensed=false`, the focused columns and the refund note.
4. `src/pages/orders/OrderPage.jsx` at `/orders/:orderId`
   (`GET /orders/:orderId`). Staff also get the telemetry list + the stage
   timeline (`src/ui/StageTimeline.jsx`, reused by SRV-47).
5. `src/styles/print.css` rules for the Sales page, and
   `src/pages/sales/PrintHeader.jsx`: tenant, period, group, "Generated …
   by …".

## Spec

- **Table columns:**
  - Time (IST)
  - Order no.
  - Machine
  - Flavor
  - Base
  - Charged (`Money` with `was` = `actual_price` when `offer_price` is
    set)
  - Payment
  - Transaction (`Id` with copy)
  - Status: `DispensedChip`
  - Staff also get Result and Reason columns (present only in the platform
    view).
  - A row → the order page.
- **Phone:** cards (time, flavor, machine, ₹, status).
- **Not dispensed tab:**
  - Time, Order no., Machine, Flavor, Charged, Transaction id (copy); staff
    + Result, Reason;
  - the note "Paid orders that weren't dispensed. Refunds are done in the
    Razorpay dashboard; this list doesn't track them.";
  - its own CSV link (`dispensed=false`);
  - the tab label shows the count from the summary totals.
- **Order page:**
  - the tenant view's fields; staff also `dispensing_result`,
    `dispensing_reason`, `received_at`, `machine_known`;
  - staff: a `dispense_cycle` stage timeline (markers at `t_offset_ms`,
    total `duration_ms`) and the other events (time, type, fields).
  - 404 → "Order not found, or you don't have access."
- **Print** (`@media print`, and a "Print report" button calling
  `window.print()`):
  - hides the nav, filters, buttons, tabs and the sales table;
  - prints the header, KPIs, both charts (light tokens), the breakdown
    tables, and the not-dispensed list (all rows in the period, fetched
    before printing: `limit=200` pages until done, capped at 1,000 rows
    with a note beyond);
  - A4 portrait, `break-inside: avoid` on blocks.

## Acceptance criteria

- [ ] `src/pages/sales/ExportCsvLink.test.jsx` › "carries the filters, never
      limit or cursor".
- [ ] `e2e/sales-list.spec.js` › "Load more pages through all sales without
      duplicates" (the seed's 120 powerfuel sales = 50 + 50 + 20).
- [ ] `e2e/sales-list.spec.js` › "tenant sees Not dispensed with no
      reason": `owner@` → the Not-dispensed rows show "Not dispensed", and
      the page text has none of the seeded reasons (e.g. "no DONE within
      deadline"); staff → the reasons visible.
- [ ] `e2e/sales-list.spec.js` › "CSV downloads with the tenant columns":
      the download's header row equals `local_time,ts,order_id,…,dispensed`,
      with no `dispensing_reason` for `owner@`.
- [ ] `e2e/sales-list.spec.js` › "order page": staff sees the stage
      timeline; `desk@` (limited) opening an order on `E2E00002` → Not
      found.
- [ ] `e2e/sales-list.spec.js` › "print report": `emulateMedia({media:
      'print'})`, then no nav or table is visible; `page.pdf()` →
      `.screenshots/sales-report.pdf`. **Opened and looked at** (charts
      legible in light, pages break cleanly).
- [ ] Screenshots: table, Not dispensed (owner, staff), order (owner,
      staff), 3 sizes × 2 themes. Looked at.

## Out of scope

Marking refunds (SP §9.6, open), CSV for other lists (product owner: not
needed), and emailing reports.
