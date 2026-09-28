# SRV-33: App shell and navigation

**As a** user on any device, **I want** navigation that shows only what my
role can use, my company's name, and a sensible landing
page, **so that** I get where I need to be quickly on a phone or a desk.

- **Refs:**
  - DP §0.1 (landing, look, devices);
  - DP §2.7 (gating), §2.9 (layouts);
  - DP §3 (IA: nav per role, landing, URL map), §6 (permission map);
  - mock-up `design/home-*.png`.
- **Depends on:** SRV-32.

## Deliverables

1. `src/shell/routes.jsx`:
   - the full DP §3.3 URL map;
   - each route has `{path, element, needs: permission | null, nav: {...} | null}`;
   - not-yet-built pages render a "Coming in SRV-NN" placeholder. They're
     removed as stories land.
2. `src/shell/Layout.jsx` on antd `Layout`: `Layout.Sider` with antd
   `Menu` (≥ 1100 px labels; 760–1099 px `collapsed` icon rail with
   tooltips); below 760 px no Sider, our top bar + our bottom tab bar
   (antd has none); `<main>` landmark; skip link. Routes load with
   `React.lazy` + `Suspense` (a `Skeleton`), to keep the first load small
   (DP §10.1a).
3. `src/shell/Sidebar.jsx`, `IconRail.jsx`, `TabBar.jsx`, `MoreSheet.jsx`
   (the phone "More": the remaining nav items + Account).
4. `src/shell/TopBar.jsx`:
   - tenant badge (`logo_text` in a lime square + name);
   - for staff, a **TenantSwitcher** (`GET /tenants`): "All tenants" →
     `/fleet`, a tenant → `/t/<id>/home`;
   - UserMenu (name, role label, Change password, Sign out).
6. Icons from `@ant-design/icons` (SVG React components; fine under the
   CSP), mapped in `src/shell/icons.js`.
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
- [ ] `e2e/shell.spec.js` › "stays light in OS dark mode":
      with `emulateMedia({colorScheme: 'dark'})` the body background is still
      the light `bg` token.
- [ ] `e2e/shell.spec.js` › "layouts by width": the sidebar at 1440, the
      rail at 820, the tab bar at 390; no horizontal overflow (the harness
      guard).
- [ ] Screenshots: the shell for staff and tenant_admin, 3 sizes; the phone More sheet. Looked at.

## Out of scope

Page content (the following stories), keyboard shortcuts, and search
across the dashboard.
