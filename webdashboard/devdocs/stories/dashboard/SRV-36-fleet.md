# SRV-36: Fleet (staff landing)

**As** FuelBot staff, **I want** every machine in every tenant on one page,
problem machines first, with faults, maintenance and today's sales, **so
that** I see what needs attention the moment I sign in.

- **Refs:** SP §4.5 (status, worst wins), §4.9 (`/fleet`), §4.10; DP §5.2
  (+ wireframe), §2.6 (cost rules); read-apis decision 8.
- **Depends on:** SRV-33, SRV-34.

## Deliverables

1. `src/pages/fleet/FleetPage.jsx`, `fleetModel.js` (a pure function: group
   by tenant, sort by status then name, filter, counts).
2. `src/pages/fleet/RefillSoonPanel.jsx`: collapsed by default. It queries
   `GET /stock?state=empty,low,refill_needed` **only when opened**.
3. Route `/fleet` (`telemetry:read`) and the staff landing.

## Spec

- **API:** `GET /api/v1/fleet` → `{items, tenants, tz}` (captured; platform
  view: `status`, `faults[{code, since}]`, `maintenance{…}`, `today{…}`).
- **Header:** "FLEET", Refresh + Updated.
- **Summary chips:** Offline / Fault / Maintenance / OK, summed from
  `tenants[].counts`. They toggle a filter; several can be on.
- **Controls:** a tenant select (from `tenants`), and a search over name,
  id and location label.
- **Tenant sections** (all tenants listed, including those with 0
  machines: "No machines registered yet").
  - Rows sorted `offline > fault > maintenance > ok`, then by
    `machineName`.
  - Row: `StatusBadge` (platform); name + `Id`; faults "CODE since
    09:42"; maintenance message (if on, with `flagged_by`); last seen
    (relative); today (`Money` revenue · orders · "n not dispensed" if >
    0); chips "Not configured" / "Disabled".
- **A row** opens `/t/<tenant>/machines/<id>/menu`.
- **States:**
  - loading skeleton;
  - error panel;
  - "No machines registered yet" overall.
- **No auto-refresh.**

## Acceptance criteria

- [ ] `src/pages/fleet/fleetModel.test.js` › "worst status first, then
      name"; "counts per tenant match"; "filters combine (status +
      tenant + search)".
- [ ] `e2e/fleet.spec.js` › "staff lands on Fleet with problem machines
      first": `DEV00001` (fault) is above `E2E00002` (ok); the powerfuel
      section shows 4 machines; globex 1.
- [ ] `e2e/fleet.spec.js` › "fault code and since are shown": "HOMING_TIMEOUT"
      visible for `DEV00001`.
- [ ] `e2e/fleet.spec.js` › "refill panel loads only when opened":
      no `/api/v1/stock` request before the click, then one.
- [ ] `e2e/fleet.spec.js` › "tenant users can't open Fleet": `owner@`
      at `/fleet` → NotAvailable, no `/api/v1/fleet` request from that
      page.
- [ ] `e2e/fleet.spec.js` › "Refresh refetches; nothing refetches by
      itself" (no request over 70 s of `page.clock` time).
- [ ] Screenshots: fleet 3 sizes; the chips filtered; the panel
      open. Looked at.

## Out of scope

Alerts (SP §8), a map view, and auto-refresh (product owner: no).
