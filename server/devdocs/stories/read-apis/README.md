# Read APIs — story set (Milestone S6)

Reporting without the dashboard: the fleet at a glance, sales (list,
summary, CSV), and for FuelBot staff the telemetry, the fault log and one
order's full story. Every response is scoped to what the caller may see and
built from the right audience's allowlist.

- Plan: [server-plan.md](../../plans/server-plan.md) §3.6 (client-time
  order), §4.5 (status, today), §4.7 (platform-only data, tenant views),
  §4.9 (the routes), §6 S6.
- Conventions: [server/CLAUDE.md](../../../CLAUDE.md).

## Execution order

| # | Story | Depends on | Produces |
|---|-------|-----------|----------|
| 18 | Record queries & fleet | S4 | `services/records.js` (scope + filters, client-time cursor pages, "today" in `DISPLAY_TZ`); `GET /api/v1/fleet` |
| 19 | Sales | 18 | `GET /sales`, `/sales/summary` (day, flavor, machine, tenant), `/sales/export.csv`; platform and tenant sale views |
| 20 | Telemetry, faults, orders | 18 | `GET /telemetry`, `/faults` (platform); `GET /orders/:order_id` (sale for all, its telemetry for platform); SIGNOFF |

## Definition of Done (every story)

`cd server && npm test` → all pass, with RBAC table rows for every route.
One commit per story (`SRV-NN: <title>`), chained with `&&` after the checks.

## Decisions

1. **Scope first, then filters.** Every query starts from `recordScope(user)`
   (platform: everything; tenant users: their tenant, and their machines when
   limited). A `tenant` filter from a tenant user other than their own, or a
   `machine` filter outside their machines, is **404 `not_found`**.
2. **Client time.** Lists sort by the record's `ts` (the client timestamp,
   plan §3.6), newest first, with a cursor over `(ts, _id)`. `from` / `to`
   (ISO) filter on `ts`, `from` inclusive, `to` exclusive. Bad dates are 400.
3. **Days are `DISPLAY_TZ` days** (default `Asia/Kolkata`): the summary's
   `day` group and the fleet's `today`.
4. **Tenant sale view** (allowlist): `order_id`, `order_number`,
   `transaction_id`, `machine_id`, `flavor_id`, `base_id`, `hopper`, prices,
   `currency`, `payment_method`, `dispensed` (true only for `success`), `ts`.
   Never `dispensing_result`, `dispensing_reason`, `extra`, `machine_known` or
   `body_*`. Platform gets the whole record.
5. **Summary metrics:** `count`, `revenue` (sum of `charged_price`: money
   taken), `not_dispensed` and `not_dispensed_amount`. Refunds aren't
   modelled, so failed dispenses sit next to revenue rather than being
   subtracted. `group=tenant` is platform-only.
6. **CSV** streams from a database cursor (no size limit), with the caller's
   view's columns, RFC 4180 quoting, and a leading `'` on cells starting with
   `= + - @` (spreadsheet formula injection).
7. **Fault log** = intervals per machine and code, rebuilt from the health
   events in client-time order: `machine_fault` opens its code,
   `machine_ok` closes `cleared` (or every board fault), `bridge_down` /
   `bridge_up` open/close `BRIDGE_DOWN`. An interval still open has
   `to: null`.
8. **Fleet `today`** per machine: sales count, revenue, not dispensed (tenant
   label; platform also gets it) and the last sale time. Platform also gets a
   per-tenant count of machines per status.
