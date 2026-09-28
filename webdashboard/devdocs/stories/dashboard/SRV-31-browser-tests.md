# SRV-31: Browser test harness (Playwright, seeded server, screenshots)

**As a** developer, **I want** a one-command browser test run against a real
server with known data, three screen sizes and both themes, and a guard
that fails on any CSP violation or page error, **so that** role visibility
and layout are tested and screenshots can be looked at.

- **Refs:** DP §0.3.8, §2.9 (widths); README DoD (screenshots). Spike D
  (Playwright on the installed Chrome: sign-in + screenshots), spike B
  (expected 401s log as console errors).
- **Depends on:** SRV-29 (serving), SRV-30 (a build to serve).

## Deliverables

1. `server/test/helpers.js`:
   - `startServer(env = {}, { port = 0 } = {})`, which listens on the
     given port;
   - existing callers are unchanged. **Server change:** `npm test` must
     pass.
2. `webdashboard/package.json`:
   - dev dependency `@playwright/test`;
   - script `e2e`: `npm run build && playwright test`;
   - `e2e:ui` for local debugging.
3. `webdashboard/playwright.config.js`:
   - `webServer: {command: 'node e2e/server.mjs', url: 'http://127.0.0.1:8795/healthz', reuseExistingServer: false}`;
   - `use.baseURL: 'http://127.0.0.1:8795/dashboard/'`;
   - `use.channel: process.env.E2E_CHANNEL ?? 'chrome'`: with
     `E2E_CHANNEL=chromium`, Playwright's own (`npx playwright install
     chromium`);
   - projects: `phone` (390×844, `isMobile`, `hasTouch`), `tablet`
     (820×1180), `desktop` (1440×900);
   - `workers: 1` (one seeded database, and specs that write reset it).
4. `webdashboard/e2e/server.mjs`:
   - `startServer({DASHBOARD_DIR: <dist>, LOG_REQUESTS: 'false', JWT_SECRET: 'e2e', MACHINE_AUTH: 'required'}, {port: 8795})`.
     The seed writes through models and services, not the kiosk API, so
     the production default applies, and SRV-42 proves a provisioned key
     works;
   - then `seed()`;
   - also exposes `POST /__e2e/reset` (reseed), mounted by wrapping the
     returned server's request handler **in this script only**, never in
     the server's `createApp`;
   - refuses to start if 8795 is taken (a clear message);
   - stops cleanly on SIGTERM.
5. `webdashboard/e2e/seed.mjs`, fixed data via the server's models and
   services (imports from `../../server/src/…`):
   - tenants: `powerfuel` (PowerFuel Gym, PF) and `globex` (Globex
     Fitness, GX);
   - powerfuel machines:
     - `DEV00001` "Bay 02" (menu of 6, a `HOMING_TIMEOUT` fault, seen now);
     - `E2E00002` "Bay 3" (a copied menu, seen now);
     - `E2E00003` "Bay 4" (not configured, never seen);
     - `E2E00004` "Old bay" (disabled);
   - globex machine: `E2E00005`;
   - users, password `e2e password 123`:
     - `staff@fuelbot.test` (platform);
     - `owner@powerfuel.test` (tenant_admin);
     - `desk@powerfuel.test` (operator limited to `DEV00001`);
     - `ops@powerfuel.test` (operator, all machines);
     - `look@powerfuel.test` (viewer);
     - `new@powerfuel.test` (viewer with `must_change_password`);
     - `boss@globex.test` (tenant_admin);
   - sales:
     - 120 over 70 days across both powerfuel machines, 9 not dispensed
       with reasons;
     - sales that straddle a week and a month boundary in IST;
     - 3 sales for globex;
   - telemetry: `dispense_cycle` per sale, one `bridge_down`/`bridge_up`
     pair, one open `HOMING_TIMEOUT`;
   - stock:
     - `portion_g` 32.5 on 4 products;
     - refills leaving hopper 1 `empty`, hopper 2 `low`, hopper 3 `ok`;
     - hopper 4 on a product without `portion_g` (`not_estimated`);
     - hopper 5 never refilled (`unknown`);
     - a product swap on `E2E00002` hopper 1 (`refill_needed`);
   - one unregistered machine id with a stored sale;
   - audit entries arise naturally from the service calls.
   - Times are relative to "now", so "today" always has sales.
6. `webdashboard/e2e/fixtures.js`:
   - a `test` extended with `signInAs(role)` (API login through
     `page.request`, then go);
   - `theme(t)` (sets `localStorage.fb_theme` via `addInitScript`);
   - `shot(name)` → `.screenshots/<project>-<theme>-<name>.png`;
   - an **auto fixture** that:
     - collects `securitypolicyviolation` events (via `addInitScript`)
       and `pageerror`, and fails the test if any occur;
     - fails on `document.documentElement.scrollWidth > innerWidth`
       (horizontal overflow) at the end of every test;
     - ignores console "Failed to load resource" lines (expected 401/403,
       spike B).
7. `webdashboard/e2e/harness.spec.js`: the harness's own tests (below).
8. `webdashboard/README.md` and `CLAUDE.md`:
   - how to run e2e and where screenshots go;
   - "look at them";
   - the Chromium fallback;
   - port 8795.

## Acceptance criteria

- [ ] `harness.spec.js` › "placeholder loads with no CSP violation" (all
      3 projects × dark/light, 6 screenshots, looked at).
- [ ] `harness.spec.js` › "the guard catches a CSP violation": a page
      that adds an inline `<script>` element via `page.evaluate` →
      `securitypolicyviolation` captured and asserted. The guard is reset
      for this test only.
- [ ] `harness.spec.js` › "seeded users can sign in via the API": each of
      the 7 accounts → 200 (or `must_change_password: true` for
      `new@`).
- [ ] `harness.spec.js` › "reset restores the seed": a write, then
      `POST /__e2e/reset`, then the count is back.
- [ ] `server/test/*`: `npm test` passes with the `startServer` change;
      existing tests are untouched.
- [ ] `npm run e2e` passes from a clean checkout (after `npm ci`) on the
      installed Chrome. With `E2E_CHANNEL=chromium` it passes after
      `npx playwright install chromium`, run once and noted in the commit.

## Out of scope

CI wiring (no CI yet, SP §8), visual diffing against baselines (people look
at the screenshots), and axe accessibility checks (product owner: best
effort).
