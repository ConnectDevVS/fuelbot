# Web dashboard: story set (Milestone S7)

The FuelBot dashboard for FuelBot staff and tenant users: a React + Vite app
in `/webdashboard`, served by the backend at `/dashboard/`. It covers every
page in the dashboard plan, for four roles, at phone, tablet and desktop
widths in a light theme, plus the small server additions it needs.

- **Plan:** [dashboard-plan.md](../../plans/dashboard-plan.md). It's the
  design brief, with the page-by-page spec, patterns, wireframes, spikes and
  risks. Every story cites its sections as "DP §n".
- **Backend:** [server-plan.md](../../../../server/devdocs/plans/server-plan.md):
  - §0 (decision log, including the 2026-09-28 dashboard answers);
  - §4.4 (admin API), §4.5 (status), §4.6 (sessions), §4.7 (roles,
    platform-only data);
  - §4.9 (read APIs), §4.10 (the dashboard, now pointing here), §4.13
    (stock), §6 (S7).
  - Cited as "SP §n".
- **Conventions:**
  - [server/CLAUDE.md](../../../../server/CLAUDE.md) for server stories;
  - `webdashboard/CLAUDE.md` (written in SRV-30) for dashboard stories;
  - the root [CLAUDE.md](../../../../CLAUDE.md) only for the "no Godot
    changes" rule. The kiosk app is **not touched** in S7.
- **Visual direction:** [design/](../../design/): mock-ups of Home
  (desktop, tablet, phone), the provisioning card, the Menu editor, the
  Stock tab (phone) and the Sales filters (phone). The
  [claude.design prompt](../../design/claude-design-prompt.md) is
  optional, for a fuller design later; S7 doesn't need it.

## Goals

1. A tenant owner sees today's sales and what needs refilling on a phone
   within two taps. A technician records a refill at the machine.
2. Provisioning a machine can't go wrong: typeable ids and key, the key
   shown once, a printable card.
3. Staff see every problem machine first, and every platform-only screen.
4. **No platform-only data on any tenant screen, ever** (proved in SRV-49).
5. Sales by day, ISO week and month; a Not-dispensed work list; a printable
   report.

## Execution order

| # | Story | Depends on | Produces |
|---|-------|-----------|----------|
| 27 | [Read API additions](SRV-27-read-api-additions.md) | S6b | `group=week\|month`; CSV `local_time`; `tenant` filter on `/fleet` and `/stock` |
| 28 | [`/auth/me` + tenant isolation](SRV-28-auth-me.md) | S2 | `permissions`, `all_machines`, `tenant`, `display_tz`, `session_expires_at`; a test sweeping every tenant route with another tenant's id (404, no write) |
| 29 | [Serve the dashboard](SRV-29-serve-dashboard.md) | — | `DASHBOARD_DIR`, `/dashboard` static + SPA fallback + dashboard CSP with a per-request style nonce + cache headers; `IMAGE_ORIGINS`; `/` → `/dashboard/` |
| 30 | [Scaffold `/webdashboard`](SRV-30-scaffold.md) | 29 | Vite + React + **Ant Design** themed for FuelBot, the CSP nonce module, palette/tokens (light), fonts, lint, vitest, CLAUDE.md, README, `.gdignore` |
| 31 | [Browser test harness](SRV-31-browser-tests.md) | 29, 30 | Playwright, seeded e2e server, CSP/page-error guard, screenshot matrix |
| 32 | [API client, session, sign-in](SRV-32-session.md) | 28, 31 | `api/client.js`, error mapping, `useMe`/`can`, sign-in, change password, sign-out, expiry banner |
| 33 | [App shell & navigation](SRV-33-shell.md) | 32 | layout (sidebar / rail / tab bar), top bar, tenant switcher, routes + gates, landing |
| 34 | [Display components & gallery](SRV-34-components.md) | 33 | antd wrappers: tables→cards, status/stock/dispensed chips, Money/DateTime/Id/CopyField, states, dialogs, `/_gallery` |
| 35 | [Forms & write patterns](SRV-35-forms.md) | 34 | antd `Form`; `useVersionedSave`, Conflict dialog, field errors, 422 panel, PriceField, RestartNote, unsaved bar |
| 36 | [Fleet](SRV-36-fleet.md) | 33, 34 | staff landing: all tenants, problems first, refill-soon panel |
| 37 | [Charts](SRV-37-charts.md) | 34 | RevenueChart (stacked, hatched), FlavorMixChart; tooltips; print |
| 38 | [Tenant Home](SRV-38-home.md) | 27, 36, 37 | tenant landing: KPIs, charts, machines, refill soon |
| 39 | [Sales: summary](SRV-39-sales-summary.md) | 27, 37 | filters, Day/Week/Month, KPIs, charts, breakdown tables |
| 40 | [Sales: list, CSV, not dispensed, orders, print](SRV-40-sales-list.md) | 39 | sales table, CSV link, Not-dispensed list, order detail, print report |
| 41 | [Stock](SRV-41-stock.md) | 35, 38 | Refill soon page, machine page frame, Stock tab, refill/adjust, threshold, history |
| 42 | [Machines, register, keys](SRV-42-machines-keys.md) | 41 | Machines list, register flow, provisioning card, Keys tab |
| 43 | [Menu & config preview](SRV-43-menu.md) | 42 | Menu tab (edit, reorder, prices, copy), Config preview tab |
| 44 | [Settings, bases, machine sales](SRV-44-settings-bases.md) | 43, 40 | Settings tab, Bases tab, disable machine, Sales tab |
| 45 | [Products](SRV-45-products.md) | 35 | library, drawer, create, archive, portion size |
| 46 | [Users & company](SRV-46-users-company.md) | 35 | Users page (tenant + staff), Company page |
| 47 | [Staff: tenants & machine ops](SRV-47-staff-machine.md) | 42 | Tenants page; Maintenance, Telemetry, Faults tabs; order telemetry |
| 48 | [Staff: fleet-wide pages](SRV-48-staff-pages.md) | 47 | Faults, Telemetry, Audit, Unregistered pages |
| 49 | [End-to-end & sign-off](SRV-49-e2e-signoff.md) | all | role walk-throughs, platform-data leak scan, real app run, SIGNOFF, docs |

## Definition of Done (every story)

- **Server stories (27–29, and 31's helper change):**
  - `cd server && npm test` passes;
  - a row is added to the RBAC table test (`server/test/audit.test.js`) for
    every new route or scope behaviour;
  - the allowlisted views are unchanged unless the story says otherwise.
- **Dashboard stories (30–49):**
  - `cd webdashboard && npm run lint && npm test && npm run build && npm run e2e`
    passes. From SRV-31 on, `npm run e2e` includes the story's specs.
  - `cd server && npm test` also passes, since e2e runs the real server.
- **Screenshots are looked at:**
  - every UI story lists the shots it adds (`webdashboard/.screenshots/`,
    gitignored), taken at **phone 390 / tablet 820 / desktop 1440** (light theme
    only);
  - the story's commit message says they were checked;
  - check for overflow, clipping, wrong role controls, and unreadable
    states.
- **Test names:** each acceptance item names its test:
  - server: `server/test/<file>.test.js`, "it" title;
  - unit: `webdashboard/src/**/<name>.test.js(x)`;
  - browser: `webdashboard/e2e/<name>.spec.js`, test title.
- **Commits:**
  - one per story, `SRV-NN: <title>`, chained with `&&` after the checks;
  - **stage files only after the gate passes**, never with `git add -A`;
  - `dist/`, `.screenshots/`, `test-results/`, `playwright-report/` and
    `node_modules/` are never committed.
- **Security:**
  - no inline scripts and no `dangerouslySetInnerHTML` (lint rule). Styles
    come from our CSS files or antd's runtime styles carrying the
    per-request nonce; `src/nonce.js` stays the first import;
  - no password or machine key in a URL, web storage, the query cache or a
    console call;
  - every non-GET sends `X-Requested-With: fuelbot-dashboard`.

## Decisions

### Product owner (2026-09-28; server plan §0 and DP §0.1)

1. **React + Vite with a build step.** This replaces the earlier "no build,
   no framework".
2. **Code in `/webdashboard`, docs in `/webdashboard/devdocs`.**
3. **Fully responsive:** phone, tablet, desktop.
4. **Charts:** revenue over time (day/week/month) and flavor mix only.
5. **No auto-refresh:** a Refresh button and an "Updated" time.
6. **FuelBot look, light theme only** (revised the same day: no dark mode
   for now, so no theme toggle). The tenant's name and logo text are
   shown; there are no per-tenant themes. No separate claude.design
   session for S7: the plan's wireframes and the mock-ups are the design.
7. **Landing:** staff → Fleet; tenant users → Home.
8. **English only; best-effort accessibility;** evergreen browsers.
9. **Extras:** a Not-dispensed work list and a print-friendly sales
   report.
10. **Ant Design** for the UI components instead of hand-written CSS (after
    spike G proved it runs under the strict CSP with a nonce).
11. **JavaScript** (JSX), not TypeScript.

Carried over (binding): platform-only data, "Not dispensed", price
permissions, temporary passwords, disable-not-delete, 48 h fixed
sessions, server-generated machine ids, keys shown once and typed by hand,
day/week/month sales, estimated stock with refills by tenant_admin+, ₹ in
whole rupees, `DISPLAY_TZ`, and the restart / ≤ 120 s notes.

### Made while writing this set (can be revisited)

1. *(Now the product owner's: JavaScript.)*
2. **Libraries:** React 19, React Router 7 (library mode), TanStack Query 5,
   antd 6 + `@ant-design/icons`, dayjs (antd's) with `timezone`,
   `@dnd-kit` for menu reordering. **Hand-written SVG charts** (antd has
   none).
3. **`/auth/me` returns effective permissions.** The UI never copies the
   role table (SRV-28).
4. **URLs carry the tenant** (`/t/:tid/…`). Staff get global pages at the
   top level.
5. **The server serves `webdashboard/dist`,** which is never committed. A
   missing build gives a 503 "not built" page.
6. **The dashboard's own strict CSP** on `/dashboard` (DP §2.4). The API
   keeps helmet's defaults. antd's runtime styles pass it through a
   **per-request nonce** (`index.html` rendered by the server; `ConfigProvider
   csp` + `src/nonce.js`). There's no `unsafe-inline`.
6a. **antd theme:** the dark green `#4D7C0F` as `colorPrimary` (readable on
    white), and lime primary buttons with dark text via component tokens
    (DP §2.8).
6b. **`App.useApp()`** for message and modal; the static calls are banned by
    lint (they miss the theme and nonce context).
7. **Playwright on the installed Chrome** (`channel: 'chrome'`), with
   Chromium as the fallback. The e2e server is in-memory Mongo + the real
   `createApp`, on a fixed port (**8795**).
8. **Fonts** subset to WOFF2 once (88 KB + 39 KB), committed with their OFL
   texts.
9. **Chart palette** validated on white (DP §2.8). The brand lime is for UI
   accents, never chart marks.
10. **Refresh model:** React Query with no focus refetch and no intervals;
    `staleTime` 5 min; targeted invalidation after writes.
11. **Cursor lists** use "Load more" (50 per page). No page numbers.
12. **The machine key** is fetched outside React Query, held in component
    state, and cleared on leave. There's no "show again".
13. **The CSV has a `local_time` column,** because owners open it in a
    spreadsheet where UTC misleads (SRV-27).

## Spikes (2026-09-28, DP §9)

These are recorded in the stories they de-risk:
- **A (CSP) and B (cookie/CSRF):** SRV-29, SRV-32.
- **C (ISO week/month in Mongo):** SRV-27.
- **D (headless screenshots):** SRV-31.
- **E (fonts):** SRV-30.
- **F (chart palette):** SRV-37.
- **G (Ant Design under the strict CSP):** SRV-29, SRV-30.

All passed. No spike code was committed.

## Sign-off

[SIGNOFF.md](SIGNOFF.md) is filled in by SRV-49.
