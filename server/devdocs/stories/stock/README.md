# Estimated stock — story set (Milestone S6b)

How much protein is left in each hopper, without sensors: refills recorded
by a tenant_admin (or platform_admin), minus a per-product portion for
every dispense cycle that actually dosed. Server-only: the app, bridge and
firmware don't change.

- Plan: [server-plan.md](../../plans/server-plan.md) §4.13 (the whole
  design), §4.1 (`portion_g`, `low_portions`), §4.7 (`stock:write`), §6 S6b.
- Conventions: [server/CLAUDE.md](../../../CLAUDE.md).

## Execution order

| # | Story | Depends on | Produces |
|---|-------|-----------|----------|
| 24 | Stock inputs | S6 | `Product.portion_g`, menu item `low_portions` (both `stock:write`); `StockEvent` model; `POST …/stock/refills`, `…/stock/adjustments`, `GET …/stock/history`; audited |
| 25 | The estimate | 24 | `services/stock.js`; `GET …/machines/:mid/stock`; `GET /api/v1/stock?state=…` (fleet-wide, scoped); RBAC rows |
| 26 | End-to-end & sign-off | 25 | live run: refill, orders through the real app, the estimate going down; SIGNOFF; docs |

## Definition of Done (every story)

`cd server && npm test` → all pass, RBAC table rows for new routes. One
commit per story (`SRV-NN: <title>`), chained with `&&` after the checks.

## Decisions

Product owner (2026-09-27): portion size varies by product; the tenant_admin
records refills; platform_admin can do everything a tenant_admin can.

Made while writing this set:

1. **`stock:write`** (tenant_admin, platform_admin) covers refills,
   adjustments, `portion_g` and `low_portions`. An operator's product or menu
   edit that *changes* `portion_g` or `low_portions` is 403
   `forbidden_field` (like prices); unchanged values pass.
2. **`portion_g`**: grams per serving, a number > 0 and ≤ 500 (decimals
   allowed, e.g. 32.5). Null clears it (stock then shows `not_estimated`).
   **`low_portions`**: a whole number 0–1000; absent = `STOCK_LOW_PORTIONS`
   (15).
3. **Refill / adjustment body:** `{hopper, level_g, note?}`. The hopper must
   be on the machine's menu; the product recorded is the one on that hopper
   now. `level_g` is a whole number 0–50 000 (grams in the hopper after
   filling or measuring).
4. **A dose** = a `dispense_cycle` telemetry event for that tenant, machine
   and hopper whose `stages` include `PROTEIN_DISPENSED`, with `ts` after the
   latest refill/adjustment. Client time (`ts`), like every report; the
   refill itself is server time, so the machine's clock matters (plan
   §4.13, "Clocks").
5. **States**, in this order: `not_estimated` (no `portion_g`), `unknown`
   (never refilled), `refill_needed` (the last refill named another
   product), `empty` (0 portions), `low` (≤ threshold), `ok`.
6. **`days_left`** = portions left ÷ (doses in the last 7 days ÷ 7), one
   decimal; null without recent doses.
7. **Fleet list** `GET /api/v1/stock?state=low,empty` (default: every
   state except `ok`): every hopper the caller may see, across machines,
   sorted by portions left. Machines not configured are skipped.
