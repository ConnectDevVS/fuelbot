# SRV-44: Machine Settings, Bases and Sales tabs

**As a** tenant admin, **I want** to edit a machine's name, kiosk header
text, support phone and bases, and disable a machine, and **as** anyone, to
see one machine's sales, **so that** each machine is set up and reviewed
in one place.

- **Refs:** SP §4.4 (machines `PATCH`, `PUT bases`, `disabled`), §3.2
  (where config fields come from); DP §5.6.4–5.6.6, §4.9, §4.12.
- **Depends on:** SRV-43, SRV-40 (the sales components).

## Deliverables

1. `src/pages/machine/SettingsTab.jsx`: the fields, Save, and a danger zone
   (Disable/Enable).
2. `src/pages/machine/BasesTab.jsx`.
3. `src/pages/machine/SalesTab.jsx`: `SalesPage` with `machine=<mid>`
   fixed and the machine filter hidden.

## Spec

- **Settings:**
  - `PATCH /tenants/:tid/machines/:mid` with `If-Match: menu_version`;
  - fields and limits per DP §5.6.5 (server: `name` non-empty ≤ 80,
    `location_label` ≤ 60, `site` ≤ 80, `support_phone` ≤ 30,
    `idle_video_url` an https URL or null);
  - empty optional fields send `null` (clears them);
  - `RestartNote`.
  - **Disable:** `PATCH {disabled: true}` after `ConfirmDialog` (DP §4.9).
    Enable needs no confirm.
- **Bases:**
  - `PUT …/bases {bases}` with `If-Match`;
  - rows id (slug), name (≤ 40), code (`B<digit>`), enabled; max 6;
  - client checks: at least one enabled, unique ids (both server rules);
  - `RestartNote`.
- **Sales tab:** summary + table + CSV with `machine=<mid>`.
- **Roles:** Settings and Bases are editable with `machines:manage`,
  read-only otherwise. The Sales tab is for everyone who can see the
  machine.

## Acceptance criteria

- [ ] `e2e/machine-settings.spec.js` › "owner edits the location label; the
      config preview shows it"
      (`tenant.location_label` in `GET …/config`).
- [ ] `e2e/machine-settings.spec.js` › "empty support phone clears it; the
      config falls back to the tenant's".
- [ ] `e2e/machine-settings.spec.js` › "bases: at least one enabled
      (client + server 400)"; "code must be B<digit>" (the server's field
      error shown).
- [ ] `e2e/machine-settings.spec.js` › "disable asks, then the machine
      shows Disabled on the list; enable restores it".
- [ ] `e2e/machine-settings.spec.js` › "operators and viewers see read-only
      settings and bases".
- [ ] `e2e/machine-settings.spec.js` › "machine Sales tab totals equal
      /sales/summary?machine=".
- [ ] Screenshots: Settings (owner, viewer), Bases, the disable confirm,
      the Sales tab, 3 sizes × 2 themes. Looked at.

## Out of scope

Ad video management beyond the URL field (SP §8), and moving machines
between tenants.
