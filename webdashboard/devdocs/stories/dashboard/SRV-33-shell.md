# SRV-33: App shell and navigation

**As a** user on any device, **I want** navigation that shows only what my
role can use, my company's name, a theme switch, and a sensible landing
page, **so that** I get where I need to be quickly on a phone or a desk.

- **Refs:**
  - DP §0.1 (landing, look, devices);
  - DP §2.7 (gating), §2.8 (theme toggle), §2.9 (layouts);
  - DP §3 (IA: nav per role, landing, URL map), §6 (permission map);
  - mock-up `design/home-*.png`.
- **Depends on:** SRV-32.

## Deliverables

1. `src/shell/routes.jsx`:
   - the full DP §3.3 URL map;
   - each route has `{path, element, needs: permission | null, nav: {...} | null}`;
   - not-yet-built pages render a "Coming in SRV-NN" placeholder. They're
     removed as stories land.
2. `src/shell/Layout.jsx`: sidebar (≥ 1100 px), icon rail (760–1099), top
   bar + bottom tab bar (< 760); `<main>` landmark; skip link.
3. `src/shell/Sidebar.jsx`, `IconRail.jsx`, `TabBar.jsx`, `MoreSheet.jsx`
   (the phone "More": the remaining nav items + Account).
4. `src/shell/TopBar.jsx`:
   - tenant badge (`logo_text` in a lime square + name);
   - for staff, a **TenantSwitcher** (`GET /tenants`): "All tenants" →
     `/fleet`, a tenant → `/t/<id>/home`;
   - ThemeToggle;
   - UserMenu (name, role label, Change password, Sign out).
5. `src/shell/theme.js`: `getTheme/setTheme` (`system|dark|light` in
   `localStorage['fb_theme']`, in try/catch), a live `prefers-color-scheme`
   listener for `system`.
6. `src/shell/icons.jsx`: inline SVG icons as React components. They're
   JSX, which is fine under the CSP.
7. `src/pages/NotFound.jsx`, `NotAvailable.jsx`,
   `src/shell/ErrorBoundary.jsx` ("Something went wrong. Reload").
8. `document.title` per route: `"<Page> · <Tenant> · FuelBot"`.

## Spec

- **Nav items and order:** DP §3.1.
  - Tenant users: Home, Sales, Stock, Machines, Products, Users*, Company*
    (* `users:manage` / `tenant:edit`).
  - Staff: Fleet, then (in a tenant) Home, Sales, Stock, Machines,
    Products, Users, Company; then the **Platform** group (Tenants, Faults,
    Telemetry, Audit, Unregistered, All users, All sales).
  - With "All tenants" selected, staff see Fleet, All sales, All users and
    the Platform group.
- **Tab bar (phone):** 4 items + More, per DP §2.9.
- **Tenant from the URL:**
  - `/t/:tid/*` sets the current tenant;
  - a tenant user at another `:tid` → Not found (no request needed:
    `tid !== me.tenant.id`);
  - staff at an unknown `:tid` → the API 404 → Not found.
- **Gating:**
  - a route whose `needs` fails → NotAvailable, and its queries are never
    mounted;
  - nav hides items that fail `can()`.
- **Active state:** a lime inset bar (sidebar), lime icon (tab bar),
  `aria-current="page"`.

## Acceptance criteria

- [ ] `src/shell/routes.test.js` › "every route declares a permission or
      null"; "every nav item's route exists".
- [ ] `e2e/shell.spec.js` › "nav per role" (a table test against DP §3.1):
      - staff sees Fleet + the Platform group;
      - tenant_admin sees Users + Company, and no Fleet or Platform;
      - both operators and the viewer see neither Users nor Company.
      - Checked on desktop (sidebar) and phone (tab bar + More).
- [ ] `e2e/shell.spec.js` › "tenant user can't open another tenant":
      `owner@` at `/t/globex/home` → Not found; no request to `/tenants/globex*`.
- [ ] `e2e/shell.spec.js` › "staff tenant switcher": switch to powerfuel →
      `/t/powerfuel/home`; "All tenants" → `/fleet`.
- [ ] `e2e/shell.spec.js` › "gated route shows Not available": the viewer
      at `/t/powerfuel/users` → NotAvailable, and no `/api/v1/users`
      request.
- [ ] `e2e/shell.spec.js` › "theme toggle persists and follows system":
      Dark/Light survive reload; System follows `emulateMedia({colorScheme})`.
- [ ] `e2e/shell.spec.js` › "layouts by width": the sidebar at 1440, the
      rail at 820, the tab bar at 390; no horizontal overflow (the harness
      guard).
- [ ] Screenshots: the shell for staff and tenant_admin, 3 sizes × 2
      themes; the phone More sheet. Looked at.

## Out of scope

Page content (the following stories), keyboard shortcuts, and search
across the dashboard.
