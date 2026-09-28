# SRV-47: Staff: Tenants, and a machine's Maintenance, Telemetry and Faults

**As** FuelBot staff, **I want** to create and disable tenants, switch a
machine's maintenance with a message, and see a machine's telemetry and
fault history, **so that** I can operate and service the fleet. Tenant
users must never see any of it.

- **Refs:**
  - product owner: telemetry, maintenance (seeing and switching), errors
    and fault logs are platform-only; maintenance reaches the machine
    within one poll (≤ 120 s);
  - SP §4.4 (tenants, maintenance: no `If-Match`), §4.5, §4.9
    (`/telemetry`, `/faults`);
  - catalog-admin decision 8; read-apis decision 7;
  - DP §5.6.8–5.6.10, §5.14 (+ wireframe).
- **Depends on:** SRV-42 (the machine page frame and tabs).

## Deliverables

1. `src/pages/tenants/TenantsPage.jsx` (`/tenants`, `tenants:create`),
   `NewTenantDialog.jsx`.
2. `src/pages/machine/MaintenanceTab.jsx` (`maintenance:read`; edits
   `maintenance:write`).
3. `src/pages/machine/TelemetryTab.jsx`: reuses `StageTimeline` (SRV-40)
   and a shared `TelemetryList.jsx` (also used by SRV-48).
4. `src/pages/machine/FaultsTab.jsx`: a shared `FaultIntervals.jsx`.

## Spec

- **Tenants:**
  - `GET /tenants`; `POST /tenants {id, name, branding?}` (409
    `tenant_exists`);
  - `PATCH /tenants/:tid {disabled}` after a confirm (DP §4.9);
  - Open → `/t/<id>/home`;
  - the id help text (DP §5.14).
- **Maintenance:**
  - `PUT …/machines/:mid/maintenance {enabled, message?, faults?}` (no
    `If-Match`);
  - it shows the current `maintenance` (flag, `flagged_by`, `flagged_at`,
    message, faults) and, separately, "Machine-reported faults (clear
    automatically)" from `faults[]`;
  - Switch on → confirm → PUT; switch off → PUT without a confirm;
  - edit message/faults while on → PUT;
  - note: "Takes effect within about 2 minutes."
- **Telemetry:**
  - `GET /telemetry?machine=<mid>&type=&from=&to=&limit=50` + cursor;
  - type filter options: `dispense_cycle`, `machine_fault`, `machine_ok`,
    `bridge_down`, `bridge_up`, `image_download_failed`, and "other"
    (free text);
  - a `dispense_cycle` row expands into a `StageTimeline`;
  - order ids link to `/orders/:id`.
- **Faults:** `GET /faults?machine=<mid>[&from&to]`, ongoing first
  ("ongoing since …"), then closed ones with duration.

## Acceptance criteria

- [ ] `e2e/staff-machine.spec.js` › "staff creates a tenant; a duplicate id
      → 'That id is taken'".
- [ ] `e2e/staff-machine.spec.js` › "disabling a tenant blocks its users":
      after a confirm, `boss@globex.test` signing in → the tenant-disabled
      message; re-enable.
- [ ] `e2e/staff-machine.spec.js` › "maintenance on/off": on (confirm) →
      `GET /fuelbot/config` for `DEV00001` (the seeded dev key) has
      `maintenance.enabled: true` and the message; Fleet shows
      MAINTENANCE; off → false. Tenant Home shows only "Out of service"
      for it (no word "maintenance").
- [ ] `e2e/staff-machine.spec.js` › "telemetry tab lists cycles with a
      stage timeline and filters by type".
- [ ] `e2e/staff-machine.spec.js` › "faults tab shows the open
      HOMING_TIMEOUT and the closed BRIDGE_DOWN with a duration".
- [ ] `e2e/staff-machine.spec.js` › "tenant roles never get these tabs or
      the Tenants page": for owner, ops, desk and look, the tab bar has no
      Maintenance/Telemetry/Faults, the direct URLs → NotAvailable, and no
      request to `/telemetry`, `/faults` or `…/maintenance` is made.
- [ ] Screenshots: Tenants, Maintenance (off/on), Telemetry (expanded),
      Faults, 3 sizes. Looked at.

## Out of scope

Remote commands to machines (pull-only, SP §8), and editing
machine-reported faults (they clear from telemetry).
