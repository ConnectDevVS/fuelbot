# SRV-48: Staff fleet-wide pages (Faults, Telemetry, Audit, Unregistered)

**As** FuelBot staff, **I want** fleet-wide fault and telemetry views, the
audit log of who changed what, and the list of machine ids that reported
but aren't registered, **so that** I can diagnose problems and
provisioning mistakes across tenants.

- **Refs:** product owner: audit log, fault log and unregistered machines
  are platform-only; SP §4.4 (`/audit` filters, `/unregistered`), §4.9;
  users-rbac decisions 8, 10; DP §5.15–5.18 (+ wireframe).
- **Depends on:** SRV-47 (`TelemetryList`, `FaultIntervals`,
  `StageTimeline`).

## Deliverables

1. `src/pages/platform/FaultsPage.jsx` (`/faults`, `faults:read`).
2. `src/pages/platform/TelemetryPage.jsx` (`/telemetry`, `telemetry:read`).
3. `src/pages/platform/AuditPage.jsx` (`/audit`, `audit:read`), `AuditDiff.jsx`.
4. `src/pages/platform/UnregisteredPage.jsx` (`/unregistered`, `unregistered:read`).

## Spec

- **Faults:** `GET /faults?tenant=&machine=&from=&to=`; filters (tenant →
  its machines); rows: tenant, machine (link), code, from, to/ongoing,
  duration.
- **Telemetry:**
  - `GET /telemetry?tenant=&machine=&type=&order_id=&from=&to=&limit=50`
    + cursor;
  - `TelemetryList` with tenant and machine columns;
  - an order id search.
- **Audit:**
  - `GET /audit?tenant=&machine=&user=&action=&from=&to=&limit=50` +
    cursor;
  - the user filter is a picker over `GET /users` (email → id);
  - action options, the known list: `auth.login`, `auth.login_failed`,
    `auth.password_change`, `user.create`, `user.update`,
    `user.password_reset`, `tenant.create`, `tenant.update`,
    `product.create`, `product.update`, `machine.register`,
    `machine.update`, `machine.bases`, `machine.maintenance`,
    `menu.update`, `menu.item_update`, `menu.copy`, `key.issue`,
    `key.revoke`, `stock.refill`, `stock.adjust`, and free text;
  - a row expands to `before`/`after` as a side-by-side key/value diff.
- **Unregistered:**
  - `GET /unregistered`;
  - columns: claimed tenant, machine id, sales, telemetry, first seen,
    last seen, "Registered under" (a tenant, or "—");
  - the help text (DP §5.15–5.18);
  - Empty: "No unregistered machines. Every id that reported is
    registered."

## Acceptance criteria

- [ ] `e2e/staff-pages.spec.js` › "faults page lists open and closed
      intervals across tenants and filters by tenant".
- [ ] `e2e/staff-pages.spec.js` › "telemetry search by order id finds the
      cycle".
- [ ] `e2e/staff-pages.spec.js` › "audit shows the refill recorded earlier
      in this run with its after-values, and filters by user and action".
- [ ] `e2e/staff-pages.spec.js` › "unregistered lists the seeded id with 1
      sale".
- [ ] `e2e/staff-pages.spec.js` › "tenant roles: every staff page URL →
      NotAvailable with no API request" (owner, ops, desk, look × 4
      pages).
- [ ] Screenshots: each page, 3 sizes, and the audit diff.
      Looked at.

## Out of scope

Exporting audit or telemetry, a telemetry retention setting (SP §9.5,
open), and claiming unregistered ids (never; ids come from the server).
