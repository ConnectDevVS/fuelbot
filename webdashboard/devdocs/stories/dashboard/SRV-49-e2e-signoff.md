# SRV-49: End-to-end and sign-off (Milestone S7)

**As the** product owner, **I want** proof that every role can do its job
on every device, that tenant screens never show platform-only data, and
that dashboard changes reach a real kiosk, **so that** S7 can be signed
off.

- **Refs:** SP §7 end-to-end steps 2 and 8 (price, override, maintenance,
  RBAC); SP §4.7 (platform-only data); DP §1 goals; README goals 1–5.
- **Depends on:** SRV-27 to SRV-48.

## Deliverables

1. `e2e/walkthrough.spec.js`: each of the 6 active seeded roles walks
   every page it can see (from the nav, not hard-coded), on all 3 projects
   and in both themes, with a screenshot per page.
2. `e2e/leak-scan.spec.js`: the platform-only data scan (below).
3. `webdashboard/devdocs/stories/dashboard/SIGNOFF.md`, filled in.
4. Docs:
   - SP §0 status (S7 done) + decision-log entries if anything changed;
   - SP §4.10 (still accurate);
   - root and `server/` CLAUDE.md and README;
   - `webdashboard/README.md`;
   - the kiosk plan's decision log if the product owner asks (the kiosk
     is unchanged).

## Spec

- **Leak scan.** For each tenant role (owner, ops, desk, look, and
  boss@globex):
  - record **every API response body** the pages receive (`page.on('response')`,
    JSON only) and the **rendered text** of every page and tab they can
    reach.
  - Fail on any of:
    - response keys `maintenance`, `faults`, `status`, `last_seen_ip`,
      `health`, `dispensing_result`, `dispensing_reason`, `machine_known`,
      `received_at`, `extra`, `body_tenant_id`, `body_machine_id`,
      `telemetry`;
    - page text matching the seeded fault codes (`HOMING_TIMEOUT`,
      `BRIDGE_DOWN`), the seeded reasons, `maintenance`,
      `Maintenance`, IP addresses (`/\b\d{1,3}(\.\d{1,3}){3}\b/`), or any
      platform nav label.
  - The scan also asserts that no request was made to `/telemetry`,
    `/faults`, `/audit`, `/unregistered` or `…/maintenance`.
- **Cross-tenant:** `boss@globex.test` sees none of powerfuel's machine
  ids, product names or order ids anywhere (responses and text).
- **Real app run** (by hand, recorded in SIGNOFF; the root CLAUDE.md
  rules apply to the app, which isn't changed):
  1. `npm run db`, `npm run seed`, `npm start` (server with the built
     dashboard), `tools/dev_run.sh --backend=server`.
  2. In the dashboard as tenant_admin, change guava's price, restart the
     app: the new price shows. Override it on the machine's menu, restart:
     the override wins.
  3. As staff, maintenance on: the kiosk shows out of service within
     ≤ 120 s; off → back.
  4. Order through to dispensing with `tools/fake_dispense_bridge.py`: the
     sale appears on Home and Sales after Refresh; the stock estimate goes
     down by one portion; staff see the cycle's stage timeline on the order
     page.
  5. A timed-out order (`--mode timeout`): the tenant sees "Not dispensed"
     on the Not-dispensed list with no reason; staff see the reason.
  6. Register a new machine in the dashboard, provision the app with the
     card's three values (`dev_setup.gd --tenant= --machine=
     --machine-key=`), copy a menu, restart: the app boots with that menu.
- **Screenshots:** the walkthrough's full matrix (≈ 6 roles × pages × 3 ×
  2) goes in `.screenshots/`; **every one is looked at**. SIGNOFF lists the
  anomalies found and fixed.

## Acceptance criteria

- [ ] `e2e/walkthrough.spec.js` passes for every role, project and theme,
      with no CSP violation, no page error and no horizontal overflow (the
      harness guard).
- [ ] `e2e/leak-scan.spec.js` › "no platform-only keys in tenant
      responses", "no platform-only text on tenant pages", "no requests to
      platform-only routes", "globex sees nothing of powerfuel": all pass.
- [ ] Every real-app step 1–6 is recorded **PASS** in SIGNOFF with what
      was seen.
- [ ] `cd server && npm test` passes and `cd webdashboard && npm run lint
      && npm test && npm run e2e` passes. The root `tools/run_tests.sh` and
      `tools/check_boot.sh` still pass (the kiosk is untouched; the
      `.gdignore` holds).
- [ ] The SIGNOFF records the counts (unit, e2e, screenshots looked at)
      and any known limitations.

## Out of scope

Deploy (hosting undecided), load testing, and a security audit by a third
party (recommended before production; noted in SIGNOFF).
