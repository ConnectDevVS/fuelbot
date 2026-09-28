# FuelBot web dashboard: plan & design brief (Milestone S7)

The web dashboard for FuelBot staff and for the companies (tenants) that run
FuelBot machines. It's a React single-page app in `/webdashboard`, built with
Vite and served by the backend at `/dashboard/`. It uses only the admin API
(`/api/v1`).

- **Backend source of truth:** [server-plan.md](../../../server/devdocs/plans/server-plan.md).
  It owns the API, the roles (§4.7) and the product-owner decision log (§0).
  This document owns how the dashboard looks and behaves. §4.10 there is a
  summary that links here.
- **Stories:** [stories/dashboard/](../stories/dashboard/README.md) (SRV-27 to SRV-49).
- **Visual direction:** [design/](../design/): a styled static mock-up, and
  the [prompt for claude.design](../design/claude-design-prompt.md).
- Every API shape quoted here was captured from the real server
  (2026-09-28, the `develop` branch at `4b55945`), not taken from prose.

## 0. Decisions

### 0.1 Product owner (2026-09-28, planning session for S7)

| # | Question | Answer | Consequence in this plan |
|---|---|---|---|
| 1 | Framework | **React + Vite, with a build step.** This replaces the previous session's "no build, no framework" | §2.1 stack; the server serves Vite's `dist/` (§2.4); CI and deploy need `npm run build` |
| 2 | Where the code lives | **`/webdashboard`** at the repo root; **all its docs in `/webdashboard/devdocs`** | Not `server/public/` (server plan §5 updated); this doc and the stories live here |
| 3 | Devices | **Fully responsive everywhere**: phone, tablet, desktop | Three layouts (§2.9); every page gets e2e screenshots at 390, 820 and 1440 px |
| 4 | Charts | **Revenue over time** (day / week / month) and **flavor mix**. No machine-comparison chart | Two chart components (§4.9); per-machine numbers are a table |
| 5 | Refresh | **No auto-refresh.** Data loads on page entry, with a Refresh button and an "Updated hh:mm" stamp | No polling, so `/fleet` and `/stock` costs stay bounded (§2.6) |
| 6 | Look | **One FuelBot look, light theme only** (revised 2026-09-28: "no need of dark mode for now"; the first answer was dark + a light toggle). The kiosk brand carries over through the lime accent, Archivo/JetBrains Mono type and uppercase headings. The tenant's name and `logo_text` badge sit in the top bar | One validated theme (§2.8); no theme toggle; tokens kept in one block so a dark theme can be added later; no per-tenant colours or logo uploads |
| 7 | Landing page | **Staff → Fleet; tenant users → Home** | §3.2 |
| 8 | Language & accessibility | **English only, best-effort accessibility** (no formal WCAG target, no axe gate). Browsers: the last 2 versions of Chrome, Edge, Safari (incl. iOS) and Firefox | Strings in one module (§2.10); keyboard and labels done well, but not gated |
| 9 | Extras | **A "Not dispensed" work list** and a **print-friendly sales report** | Sales page preset and print stylesheet (§5.8) |
| 10 | UI components | **Ant Design** (antd 6), not hand-written CSS (revised 2026-09-28) | antd themed from our tokens (§2.8); its runtime styles run under the strict CSP with a per-request nonce (§2.4, spike G); a small hand-written stylesheet only for layout and our own pieces |
| 11 | Language of the code | **JavaScript** (JSX), not TypeScript | §0.3.1 is now the product owner's decision; open question §10.1 closed |
| 12 | A separate claude.design session | **Not needed for S7.** The wireframes (§5) plus the mock-ups in `design/` are the design | The claude.design prompt stays as an option for later |

### 0.2 Binding decisions carried from the server plan (product owner, 2026-09-26/27)

One dashboard and one backend for two audiences. Platform-only data:
telemetry, maintenance, errors and failure reasons, audit, faults and
unregistered machines. Tenant users see online/offline, last seen, and in
service / out of service with no reason. A failed sale shows as **"Not
dispensed"**. Only `tenant_admin` and `platform_admin` change prices and
offers. Users are created with temporary passwords and are disabled, never
deleted. Sessions last 48 h, fixed. Machine ids are server-generated; machine
keys are shown once and typed by hand. Sales are shown by day, ISO week and
month. Stock is estimated (refills by `tenant_admin`+). Money is ₹ in whole
rupees; times are in `DISPLAY_TZ`. Catalog changes reach a machine at its
next restart, and maintenance within one poll (≤ 120 s).

### 0.3 Decisions made while planning (not the product owner's; can be revisited)

1. **Plain JavaScript (JSX), not TypeScript.** Confirmed by the product
   owner (§0.1 row 11), matching the server.
2. **Libraries (few, mainstream):**
   - runtime:
     - `react`, `react-dom`, `react-router` (v7, library mode), `@tanstack/react-query` (v5);
     - **`antd` (v6) and `@ant-design/icons`**; `dayjs` (antd's date library) with its `utc` and `timezone` plugins;
     - `@dnd-kit/core` and `@dnd-kit/sortable` for drag-to-reorder on the Menu tab (antd has no drag-and-drop; its own docs use dnd-kit).
   - dev: `vite`, `@vitejs/plugin-react`, `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@playwright/test`, `eslint` with `eslint-plugin-react-hooks`.
   - **No CSS framework.** antd provides the components. A small stylesheet
     (CSS modules + `tokens.css`) covers page layout, the phone tab bar, the
     provisioning card and the charts.
3. **Charts are hand-written SVG React components** (two bar charts). antd
   has no charts, and `@ant-design/charts` is a large canvas library. They
   need print, hatching and tooltips, which comes to about 250 lines, with no
   dependency to keep patched.
4. **`/auth/me` returns the caller's effective permissions**, plus
   `display_tz`, the session expiry and the tenant's name. The UI never
   copies the role table (SRV-28).
5. **`/fleet` and `/stock` get a `tenant` filter**, and the sales CSV gets a
   `local_time` column in `DISPLAY_TZ` (SRV-27).
6. **The server serves `webdashboard/dist`** with its own strict CSP, a SPA
   fallback, and long-cache hashed assets (SRV-29). `dist/` is never
   committed.
7. **URLs carry the tenant** (`/dashboard/t/<tenant>/…`), so staff can deep
   link into any tenant and tenant users get the same links. Editing the URL
   gives a tenant user nothing: see §2.7, "Why the tenant in the URL is
   safe".
8. **Browser tests use Playwright** on the installed Google Chrome
   (`channel: 'chrome'`, no download), falling back to Playwright's Chromium
   (`npx playwright install chromium`).
9. **Fonts:** the kiosk's OFL Archivo and JetBrains Mono, subset once to
   WOFF2 (Latin + `₹` + punctuation, variable axes kept). That's 88 KB + 39 KB
   instead of 658 KB + 187 KB (measured).
10. **Chart palette:** chart marks use their own validated steps, not the
    brand lime (§2.8).
11. **antd under the strict CSP with a nonce** (spike G). The server renders
    `index.html` per request with a fresh nonce; antd's `ConfigProvider csp`
    and a tiny first-loaded module put it on every `<style>`. There's no
    `unsafe-inline`. antd's `zeroRuntime` mode was tried and doesn't work
    with a custom theme in 6.6.5.

## 1. Scope & goals

**In S7:** every page in §5 for all four roles, at three widths, in the
light theme. The server additions listed below. Unit and browser tests. An
end-to-end sign-off in which each role walks its pages against a seeded
server, with a scan for platform-only data on tenant screens.

**Server additions (small, each keeping the RBAC table and allowlisted
views intact):**
- `group=week|month` in the sales summary;
- the `local_time` CSV column;
- a `tenant` filter on `/fleet` and `/stock`;
- `/auth/me` permissions;
- serving the dashboard with a CSP;
- a port option for the test harness.

**Not in S7:**
- product image upload (S5 is deferred; the drawer shows the current image);
- alerts, email, refunds (the Not-dispensed list is read-only);
- dark mode and a theme toggle (product owner: not for now), per-tenant
  themes, i18n, auto-refresh;
- the `platform_viewer` role;
- a machine-comparison chart;
- deploy.

**Goals, in order:**
1. A tenant owner sees today's sales and what needs refilling on a phone
   within two taps.
2. A technician records a refill at the machine on a phone.
3. Provisioning a new machine can't go wrong: ids and key are shown
   typeably, the key once, with a printable card.
4. Staff see every problem machine first.
5. Nothing platform-only ever reaches a tenant screen.

## 2. Architecture

### 2.1 Stack and folder layout

```
webdashboard/
├── CLAUDE.md            rules for changing the dashboard (SRV-30)
├── README.md            how to run, build and test it
├── .gdignore            Godot must never scan node_modules/ (like server/.gdignore)
├── package.json         scripts: dev, build, preview, test (vitest), e2e (playwright), lint
├── vite.config.js       base '/dashboard/'; dev proxy /api and /files → DASHBOARD_API_URL (default http://127.0.0.1:8790)
├── playwright.config.js projects: phone 390×844, tablet 820×1180, desktop 1440×900
├── index.html           no inline script or style; <meta name="color-scheme" content="light">;
│                        <meta name="csp-nonce" content="__CSP_NONCE__"> (the server fills it per request)
├── src/
│   ├── nonce.js         imported FIRST: gives every <style> the page creates the CSP nonce (§2.4)
│   ├── main.jsx         router + QueryClient + antd ConfigProvider (theme, csp nonce, locale) + antd App
│   ├── theme/           antdTheme.js (antd tokens + component tokens, from the palette), palette.js
│   ├── api/             client.js (fetch wrapper), errors.js (code → message), queries.js (query keys + hooks)
│   ├── auth/            session (useMe, can()), RequireAuth, sign-in, change-password
│   ├── shell/           Layout, Sidebar, TabBar, TopBar, TenantSwitcher, routes.jsx
│   ├── ui/              thin wrappers over antd (§4) + the few own components; CSS modules for layout only
│   ├── charts/          RevenueChart, FlavorMixChart, scales.js
│   ├── lib/             time.js (DISPLAY_TZ days, ISO weeks, ranges), money.js, names.js, csv links
│   ├── pages/           one folder per page (§5)
│   ├── strings.js       every user-facing string (English; later translatable)
│   └── styles/          tokens.css (the light theme), base.css, print.css, fonts/ (WOFF2 + OFL texts)
├── e2e/                 server.mjs (seeded test server), seed.mjs, fixtures.js, *.spec.js
└── devdocs/             plans/, stories/, design/
```

The kiosk app isn't touched. `server/public/` (empty, untracked) is dropped
from the plan.

### 2.2 Dev workflow

- `cd server && npm run db`, `npm run seed`, `npm start` (as today).
- `cd webdashboard && npm run dev` starts Vite on **:5173** with a proxy from
  `/api` and `/files` to :8790. The browser sees one origin, so the
  SameSite=Strict cookie works. Verified in spike B (§9).
- `npm run build` writes `webdashboard/dist/`. The server serves it at
  `http://127.0.0.1:8790/dashboard/` (SRV-29), which is the production path.

### 2.3 Talking to the API (`src/api/client.js`)

- `api(method, path, {body, ifMatch, signal})`:
  - `fetch('/api/v1' + path, {credentials: 'same-origin'})`;
  - `Accept: application/json`;
  - on every non-GET: `X-Requested-With: fuelbot-dashboard` and
    `Content-Type: application/json`;
  - `If-Match: <n>` when given.
- On a non-2xx response it throws `ApiError {status, code, details}`, where
  `code` is the body's `error`.
- Global handling (a React Query `QueryCache`/`MutationCache` `onError`):

| Response | Action |
|---|---|
| 401 `not_signed_in` | clear the query cache; go to `/sign-in?next=<current path>` |
| 403 `password_change_required` | go to `/change-password` (the only page allowed) |
| 403 `tenant_disabled` | sign-in page with "Your company's access is disabled. Contact FuelBot." |
| 403 `csrf_header_required` | a bug; show a "Something went wrong" panel (never expected) |
| 404 `not_found` | the page's Not-found state (another tenant's data is 404 by design) |
| others | handed to the page or form (§4.10, §7) |

- **Never** put a password or machine key in a URL, `localStorage`,
  `sessionStorage`, the React Query cache, or a `console.*` call. The key
  response is read by a plain `fetch` in the issuing component and kept in
  component state only. An ESLint rule forbids `console` in `src/`.
- **Sales CSV:** a plain `<a href="/api/v1/sales/export.csv?…" download>`
  with the current filters. It's a same-origin GET, so the cookie goes along
  and no JS is involved.

### 2.4 Serving and CSP (server side, SRV-29)

- **Setting:** `DASHBOARD_DIR` (default `<repo>/webdashboard/dist`).
- **Mount:** `/dashboard` with its own `helmet` CSP. Everything else keeps
  helmet's defaults.

  ```
  default-src 'self'; script-src 'self'; style-src 'self' 'nonce-<per request>';
  img-src 'self' data: <S3_PUBLIC_BASE_URL origin or the bucket's https origin> <PUBLIC_URL origin> <IMAGE_ORIGINS…>;
  font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self';
  frame-ancestors 'none'; form-action 'self'
  ```

  - `upgrade-insecure-requests` only when `NODE_ENV=production`: on plain
    `http://` to a LAN IP it would break the page.
  - `IMAGE_ORIGINS` is an optional comma list, for image hosts products were
    imported with.
  - A blocked image shows the placeholder (the `<img onError>`), never a
    broken icon.
- **The style nonce (Ant Design; spike G):**
  - antd 6 writes its component styles as `<style>` elements at runtime (CSS-in-JS), which
    `style-src 'self'` alone blocks: 63 violations and unstyled components
    in spike G.
  - So the server renders `index.html` **per request**: a fresh 128-bit
    random nonce replaces `__CSP_NONCE__` in `<meta name="csp-nonce">`, and
    the same value goes in the CSP header (`style-src 'self' 'nonce-…'`).
  - In the app:
    - `ConfigProvider csp={{nonce}}` puts it on antd's styles;
    - `src/nonce.js`, imported first, sets it on any other `<style>` a
      library creates. Spike G found 3 such styles, from antd's helper
      library: a scrollbar measure and the drawer's scroll lock.
  - Result: **0 violations, no `unsafe-inline`.**
  - Scripts stay `'self'` only; the nonce applies to styles only.
  - A placeholder left in the page (the dev server, or a direct file) means
    no nonce, and the app still runs, because the dev server sends no CSP.
- **Caching:**
  - `/dashboard/assets/*` (content-hashed): `Cache-Control: public, max-age=31536000, immutable`;
  - `index.html`: `Cache-Control: no-store`. It carries a per-request nonce,
    so no browser or proxy may reuse it.
- **SPA fallback:** any other `GET /dashboard/*` gets `index.html`, so deep
  links work. A missing file under `/dashboard/assets/` is a real 404.
- **No build yet:** if `DASHBOARD_DIR/index.html` is missing, `/dashboard/`
  answers 503 with a short HTML "Dashboard not built: run `npm run build` in
  `webdashboard/`", and the server logs it once at boot.
- `GET /` redirects to `/dashboard/`.
- **Spike A (§9):** a Vite production build ran with zero CSP violations
  under this policy and under helmet's default. The font loaded; the cookie
  and the CSRF header worked; deep links fell back.
- **Spike G (§9):** an antd 6 page (layout, menu, table, date-range picker,
  select, drawer, toast, segmented) ran with the nonce setup: 0 violations,
  and the theme was applied.

### 2.5 Session and identity (`/auth/me`, SRV-28)

Today `/auth/me` returns only the user view. After SRV-28:

```json
{"user": {"id": "…", "email": "desk@powerfuel.example", "name": "Desk", "role": "operator",
          "tenant_id": "powerfuel", "machines": ["DEV00001"], "disabled": false,
          "must_change_password": false, "last_login_at": "…", "created_at": "…"},
 "permissions": ["tenant:read", "machines:read", "catalog:read", "menu:edit", "sales:read"],
 "all_machines": false,
 "tenant": {"id": "powerfuel", "name": "PowerFuel Gym", "logo_text": "PF"},
 "display_tz": "Asia/Kolkata",
 "session_expires_at": "2026-09-30T07:12:03Z"}
```

- `permissions` is the role's set from `auth/rbac.js`, minus `products:edit`
  when the user is limited to some machines (the server's
  `NEEDS_ALL_MACHINES` rule). So `can('products:edit')` in the UI matches
  the server exactly. Captured: a limited operator's product PATCH is 403
  `forbidden`, not `forbidden_field`.
- `tenant` is null for `platform_admin`. Staff pick a tenant in the
  switcher (`GET /tenants`).
- **Session end:** the UI shows a banner 30 min before `session_expires_at`
  ("Your session ends at 14:05. Save your work, then sign in again."). A
  form that gets a 401 keeps its values in memory and reopens after sign-in
  on the same tab (the `next` path). Nothing is persisted.

### 2.6 Data loading and refresh (no auto-refresh)

- **React Query settings:**
  - `refetchOnWindowFocus: false`, `refetchInterval: false`, `retry: 1` for GETs (never for 4xx);
  - `staleTime`: 5 min;
  - `/auth/me`: `staleTime: Infinity`, refetched after a password change.
- **Every data page:** a **Refresh** button (refetches that page's queries)
  and "Updated 12:42" (IST) from the newest `dataUpdatedAt`.
- **After a write:** invalidate the affected keys only. For example, a menu
  save invalidates the machine, its config, its stock, `fleet` and
  `products`.
- **Expensive reads:**

| Read | Cost | Used by | Rule |
|---|---|---|---|
| `GET /fleet` | one sales aggregate + status per machine | Fleet, Home, Machines list | on page entry and Refresh only; `?tenant=` on tenant pages (SRV-27) |
| `GET /stock` | per machine, per hopper: 1–3 queries | Home (top 5), Stock page, Fleet panel | only on entry/Refresh; `?tenant=`; Fleet loads it only when the panel is opened |
| `GET /tenants/:tid/products` | one extra query for the machines each product is on | Products, Menu picker, name lookups | cached 5 min; archived included once per tenant for sale-name lookups |
| `GET /sales/summary` | aggregate over the range | Home, Sales (3 calls per filter change) | debounced 300 ms on filter changes |

- **Pagination:** cursor lists (sales, telemetry, audit, users, stock
  history) show 50 rows and a **Load more** button (`next_cursor`). No page
  numbers. Filters reset the cursor.

### 2.7 Routing, roles and gating

- **Routes** are in §3.3. Each route declares the permission it needs. A
  route the user lacks shows the **Not available** page, with no data
  request.
- `can(permission)` reads `/auth/me` `permissions`. **The UI only hides;
  the server enforces.** Every write handles 403 anyway (§4.10).
- **Staff (`platform_admin`):**
  - get a **tenant switcher** in the top bar: "All tenants", then each
    tenant. Choosing a tenant navigates to `/t/<id>/home`.
  - Staff-only pages (§3.3) sit in a "Platform" nav group.
- **Tenant users:** the switcher is a static badge with their tenant's name
  and `logo_text`. `/t/<other>/…` renders Not found, and so does the API.

**Why the tenant in the URL is safe** (the product owner asked: what stops
a tenant_admin replacing `powerfuel` with another tenant's name?)

- **The URL doesn't grant anything; it only names what the page asks for.**
  Who the user is comes from the session cookie. It's httpOnly, so page
  code can't read or change it, and it's signed by the server.
- **The server checks every request** against the signed-in user's own
  tenant (`auth/rbac.js`, SP §4.7):
  - `/tenants/globex/...` from a PowerFuel user is **404 `not_found`**, for
    reads and writes alike. It's 404, not 403, so it doesn't even confirm
    the tenant exists.
  - Record queries (`/sales`, `/fleet`, `/stock`, `/orders/:id`) always
    start from the user's own tenant (and machines), whatever filters are
    sent.
- **Checked against the real server while planning:** a PowerFuel viewer
  asking for `/tenants/globex/products` got 404. The RBAC table test
  already has that row for all tenant roles.
- **Made explicit in S7:**
  - a server test sweeps every `/tenants/:tid/...` route (every method) as
    each tenant role with another tenant's id, expecting 404 and no write
    (SRV-28);
  - the UI shows Not found at `/t/<other>/…` without making a request
    (SRV-33);
  - the end-to-end leak scan confirms that `boss@globex` sees nothing of
    PowerFuel (SRV-49).
- **The same holds inside a tenant:** an operator limited to Bay 02 who
  types Bay 3's id gets 404 too.
- The tenant is in the URL only so staff can link to any tenant's page.
  Tenant users would be exactly as safe without it.

### 2.8 Theme and brand

- **Light theme only** (product owner, 2026-09-28: no dark mode for now).
  There's no theme toggle and no theme stored in the browser. The page sets
  `<meta name="color-scheme" content="light">`, so it stays light when the
  OS is in dark mode.
- **One palette, two consumers.**
  - `src/theme/palette.js` holds the colours below.
  - `src/theme/antdTheme.js` builds antd's theme from it (next table).
  - `src/styles/tokens.css` holds the same values as CSS custom properties
    for our own CSS: layout, charts, the provisioning card.
  - A unit test keeps the two identical.
  - A dark theme later means a second palette (the kiosk's
    `ui/theme/palette.gd` is its starting point) plus antd's `darkAlgorithm`.

| Token | Value |
|---|---|
| bg | `#F4F5F2` |
| surface | `#FFFFFF` |
| raised | `#FAFAF8` |
| border | `#E1E3E6` |
| text | `#111215` |
| muted | `#4B5159` |
| dim | `#6B717A` |
| accent | `#C8FF3E`, as a fill with `on-accent` text only, never as text on white |
| on-accent | `#111215` |
| ok | `#15803D` |
| warn / warn surface / warn border | `#A16207` / `#FEF7E6` / `#F2D58A` |
| bad / bad surface | `#B91C1C` / `#FDECEC` |

- **antd theme** (`ConfigProvider theme`; checked in spike G):

| antd token | Value | Why |
|---|---|---|
| `colorPrimary` | `#4D7C0F` (dark green) | links, focus rings, checkboxes, selected rows need a colour readable on white; the lime isn't |
| `colorLink` | `#3F6A0B` | |
| `colorText` / `colorTextSecondary` | `#111215` / `#4B5159` | |
| `colorBorder`, `colorBgLayout`, `colorBgContainer` | `#E1E3E6`, `#F4F5F2`, `#FFFFFF` | |
| `colorSuccess` / `colorWarning` / `colorError` | `#15803D` / `#A16207` / `#B91C1C` | |
| `borderRadius` / `borderRadiusLG` | 10 / 16 | |
| `fontFamily` | `Archivo, system-ui, sans-serif` | (`fontSize` 15) |
| `Button` (component tokens) | `colorPrimary #C8FF3E`, hover `#B6F02B`, active `#A6DC24`, `primaryColor #111215`, `primaryShadow none`, `fontWeight 700` | **primary buttons are lime with dark text**, as on the kiosk (verified in spike G) |
| `Segmented` | `itemSelectedBg #C8FF3E`, `itemSelectedColor #111215` | the Day/Week/Month switch |
| `Menu` | `itemSelectedBg #EEF0EA`, `itemSelectedColor #111215` | sidebar |
| `Layout` | `siderBg #FFFFFF`, `headerBg`/`bodyBg #F4F5F2` | |

  The heavy uppercase page titles (Archivo 900) and the mono labels are our
  own small CSS classes (`.page-title`, `.overline`), since antd's
  Typography doesn't do them.
- **Chart marks** (validated with the dataviz checker for lightness,
  chroma, colour-blind separation and contrast on white):
  - Dispensed, or a single series: `#4D7C0F`.
  - Not dispensed: `#9D3FD6`, hatched at 135°, always with a legend.
  - The brand lime is for UI accents only, never chart marks. Green against
    orange was rejected because it fails colour-blind separation.
- **Type:**
  - Archivo (variable): headings 900 uppercase (the kiosk's "FUEL UP"
    look) and body text.
  - JetBrains Mono: small uppercase labels, ids, keys and codes. Its dotted
    zero tells `0` from `O`, which matters for typed machine ids.
- **Shape:** 16 px card radius, 10 px control radius, 1 px borders, no
  shadows except on dialogs and drawers.
- **Print** uses the same tokens.
- **Status is never colour alone:** every status has a label or icon
  ("Online", "Out of service", "LOW").

### 2.9 Responsive layout

| Width | Navigation | Content |
|---|---|---|
| ≥ 1100 px | left sidebar (232 px) with labels | multi-column grids (KPI ×4, cards 1.5 : 1) |
| 760–1099 px | icon rail (72 px) with tooltips | KPI ×2, cards stacked |
| < 760 px | top bar + **bottom tab bar** (5 slots: 4 main pages + More) | one column; tables become card lists; drawers become full-screen sheets; filters in a sheet behind a "Filters (n)" button |

- **Rules:**
  - no horizontal page scroll at any width (an e2e check on every page);
  - touch targets ≥ 44 px;
  - wide tables scroll inside their own container only on tablet and up,
    and become cards on phone.
- **Bottom tabs per role:**
  - tenant users: Home, Sales, Stock, Machines, More;
  - staff: Fleet, Sales, Stock, Machines, More.
- **With antd:**
  - `Layout.Sider` (`breakpoint="lg"`, collapsed to the icon rail below
    1100 px, hidden below 760 px);
  - `Grid.useBreakpoint()` switches layouts;
  - the bottom tab bar is our own component (antd has none);
  - `Table` on tablet and desktop, and our card list (antd `Card`s) on
    phone. Not antd `List`, which 6.6 deprecates;
  - `Drawer` becomes `placement="bottom"`, full height on phone;
  - filters in a bottom `Drawer` on phone;
  - `Modal` for dialogs.
- The mock-ups in `design/` show Home at desktop, tablet and phone, and
  the provisioning card, Menu editor, Stock tab and Sales filters (§5).

### 2.10 Money, time, text

- **Money:** `₹1,23,456` (Indian grouping, `Intl.NumberFormat('en-IN')`),
  whole rupees and no decimals. Amounts are always `charged_price` (what was
  paid). Offer vs list price shows as `₹75 ~~₹90~~`.
- **Time:** all shown in `display_tz` from `/auth/me`, with "IST" appended
  when the zone is `Asia/Kolkata`. Relative times are used for last seen
  ("just now", "4 min ago", "3 h ago", then the date).
- **Day ranges** are built in `display_tz` and sent as ISO instants with an
  offset (`2026-09-28T00:00:00+05:30`). `from` is inclusive, `to`
  exclusive (read-apis decision 2).
  - `lib/time.js` computes day / ISO week / month keys **exactly like the
    server** (`%Y-%m-%d`, `%G-W%V`, `%Y-%m`). It fills missing buckets with
    zeros.
  - Unit-tested on the edges spike C proved on the server (Sun 23:59 vs Mon
    00:00 IST; 1 Jan 2027 = `2026-W53`; 29 Dec 2025 = `2026-W01`) and in a
    DST zone.
- **Names:**
  - Sales and summaries carry ids. Flavor names come from
    `GET /tenants/:tid/products?archived=true` (archived included, since old
    sales name them). Machine names come from `/fleet` or
    `/tenants/:tid/machines`.
  - A machine's display name is `name || location_label || id` (the seeded
    `DEV00001` has an empty `name`).
  - Unknown ids show the id itself.
- **Strings:** all in `src/strings.js`. "Not dispensed" is the only word for
  a failed sale on tenant screens.

## 3. Information architecture

### 3.1 Navigation per role

| Nav item | platform_admin | tenant_admin | operator | viewer |
|---|---|---|---|---|
| Fleet (all tenants) | ✓ (landing) | – | – | – |
| Home | ✓ (in a tenant) | ✓ (landing) | ✓ (landing) | ✓ (landing) |
| Sales | ✓ (all or one tenant) | ✓ | ✓ (their machines) | ✓ (their machines) |
| Stock (refill soon) | ✓ | ✓ | ✓ (read) | ✓ (read) |
| Machines | ✓ | ✓ | ✓ (their machines) | ✓ (their machines) |
| Products | ✓ | ✓ | ✓ (edit text only with all machines) | ✓ (read) |
| Users | ✓ (all, or one tenant's) | ✓ (own tenant) | – | – |
| Company (branding) | ✓ | ✓ | – | – |
| **Platform:** Tenants, Faults, Telemetry, Audit, Unregistered | ✓ | – | – | – |
| Account menu: Change password, Sign out | ✓ | ✓ | ✓ | ✓ |

### 3.2 Landing

After sign-in (or `/dashboard/`):
- `platform_admin` → `/fleet`;
- everyone else → `/t/<their tenant>/home`;
- a `next` path from a 401 wins, if the user may see it.

### 3.3 URL map (all under `/dashboard`)

| Path | Page | Permission |
|---|---|---|
| `/sign-in`, `/change-password` | §5.1 | none / signed in |
| `/fleet` | §5.2 Fleet | platform (`telemetry:read` stands for "platform"; see §6) |
| `/sales` | §5.7 Sales, all tenants | platform |
| `/orders/:orderId` | §5.9 Order detail | `sales:read` |
| `/tenants` | §5.14 Tenants | `tenants:create` |
| `/users` | §5.12 Users, all tenants | platform + `users:manage` |
| `/faults`, `/telemetry`, `/audit`, `/unregistered` | §5.15–5.18 | `faults:read`, `telemetry:read`, `audit:read`, `unregistered:read` |
| `/t/:tid/home` | §5.3 Home | `machines:read` |
| `/t/:tid/sales` (`?view=not-dispensed`) | §5.7, §5.8 | `sales:read` |
| `/t/:tid/stock` | §5.10 Refill soon | `machines:read` |
| `/t/:tid/machines` | §5.4 Machines list | `machines:read` |
| `/t/:tid/machines/new` | §5.5 Register a machine | `machines:manage` |
| `/t/:tid/machines/:mid/:tab` | §5.6 Machine page (tab default `menu`) | per tab (§5.6) |
| `/t/:tid/products` (`?p=<id>`, `?new=1`) | §5.11 Products + drawer | `catalog:read` |
| `/t/:tid/users` | §5.12 Users | `users:manage` |
| `/t/:tid/company` | §5.13 Company | `tenant:read` (edit `tenant:edit`) |
| anything else | Not found | – |

## 4. Shared UI patterns

**Built on Ant Design** (product owner, §0.1 row 10). Each pattern below is
a thin wrapper in `src/ui/`, so pages use our names and behaviour, and antd
details live in one place:

| Pattern | antd | Our part |
|---|---|---|
| Page header | `Typography`, `Space`, `Button` | `.overline` + `.page-title` classes, Refresh + "Updated" |
| Loading / empty / error / not found | `Skeleton`, `Empty`, `Alert` + Retry, `Result` (404/403) | messages from `strings.js` |
| Tables | `Table` (sorting, `rowKey`, `onRow`) | phone card list below 760 px; "Load more" for cursors |
| Status, stock, dispensed chips | `Tag` (+ icon) | never colour alone; tenant-safe rendering (§4.6) |
| KPIs | `Statistic`, `Card` | ₹ formatting, the warning variant |
| Money, time, ids | `Typography.Text copyable` for ids | `Money`, `DateTime`, `RelativeTime`, `CopyField` (canonical value) |
| Confirm dialogs | `App.useApp().modal.confirm` (danger) | consequence texts (§4.9) |
| Drawer / sheet | `Drawer` (right on desktop, bottom on phone) | |
| Toasts | `App.useApp().message` | never error-only |
| Forms | `Form`, `Form.Item` (`validateStatus`, `help`), `Input`, `InputNumber`, `Select` (`showSearch`, `mode="tags"` for ingredients and allergens), `Switch`, `Checkbox` | `useVersionedSave`, server errors via `form.setFields`, `PriceField`, `RestartNote`, `UnsavedBar` |
| Periods and filters | `DatePicker.RangePicker` (`presets`), `Segmented` (Day / Week / Month), `Select` | ranges in `display_tz` (dayjs `timezone` plugin) |
| Register flow | `Steps` | the provisioning card (our own component; mock-ups `provisioning-*.png`) |
| Order and machine facts | `Descriptions` | |
| Menu reorder | — | `@dnd-kit/sortable` + ↑/↓ buttons |
| Charts | — | our SVG charts (SRV-37) |

Use `App.useApp()` for `message` and `modal`, never the static
`message.success()`/`Modal.confirm()`: the static functions don't get the
`ConfigProvider` context (theme and CSP nonce).

1. **Page header:** a mono overline (context: date, tenant, or machine id),
   an H1 in Archivo 900 uppercase, and actions on the right (Refresh +
   "Updated hh:mm", the primary action). On phone the actions wrap under the
   title.
2. **Loading:**
   - skeleton blocks shaped like the content (no spinners for page loads);
   - buttons show a spinner and are disabled while their request runs.
3. **Empty states:** one sentence saying why, plus the next action when the
   role has it. For example: "No machines yet. Register your first machine"
   (tenant_admin), or "No machines yet. Ask your admin to register one"
   (viewer).
4. **Errors:**
   - a failed load shows an inline panel ("Couldn't load sales. Retry"), and
     the rest of the page stays usable;
   - network down: "You're offline or the server isn't reachable";
   - 404: "Not found, or you don't have access" (never says which).
5. **Tables:**
   - header row in mono caps; numbers right-aligned in tabular figures;
   - rows link to the detail page;
   - on phone, a card per row with the 2–3 key fields.
6. **Status components** (never colour alone):
   - `StatusBadge`: platform `ok/maintenance/fault/offline`; tenant
     "Online/Offline" + "In service/Out of service";
   - `StockChip`: `EMPTY/LOW/REFILL NEEDED/UNKNOWN/NOT ESTIMATED/OK`;
   - `DispensedChip`: "Dispensed" / "Not dispensed". Platform also sees the
     result code and reason.
7. **Money, time and ids:**
   - `Money`, `DateTime` and `RelativeTime` components (§2.10);
   - `Id` renders mono text with a copy button.
8. **CopyField:**
   - a mono value, a Copy button (`navigator.clipboard.writeText`), and
     "Copied" feedback for 2 s. If clipboard access is denied, it selects
     the text.
   - The copy goes to the clipboard only, never to storage or logs.
9. **ConfirmDialog for destructive actions.** It names the consequence and
   uses a red confirm button whose label repeats the verb:

| Action | Consequence text |
|---|---|
| Revoke key | "The machine using key SU8B… will be refused until it has a valid key. Its sales stay on the machine meanwhile." |
| Disable user | "They're signed out now and can't sign in until re-enabled." |
| Disable machine | "The machine stops receiving its menu and shows its cached one. Its sales are kept." |
| Disable tenant | "All its machines are refused and its users can't sign in." |
| Maintenance on | "The kiosk shows Out of service within about 2 minutes and takes no payments." |
| Archive product | as for disabling (plain confirm) |

   Maintenance off and re-enabling don't need a confirmation.

10. **Forms with versions (`useVersionedSave`):**
    - The form keeps the `rev` / `menu_version` it loaded and sends
      `If-Match`.
    - **409 `version_conflict`:** a **Conflict dialog**: "Someone else
      changed this since you opened it." It refetches, lists the fields that
      differ (theirs vs yours), and offers **Keep my changes** (re-applies
      your edits onto the new version and saves with the new `If-Match`) or
      **Discard mine**.
    - **428 `if_match_required`:** a programming error. Show the generic
      error panel and log to the console in dev only.
    - **400 `invalid_body`:** `details[]` map to fields by `field` path
      (`menu[2].hopper` → that row's hopper). Unknown paths go in a summary
      above Save.
    - **422 `invalid_config`:**
      - The panel says "The machine would reject this menu", with each
        machine's name and the app's own error strings (e.g. "chocolate:
        hopper 1 already used by guava").
      - For product edits it lists every affected machine.
      - Nothing is saved.
    - **403 `forbidden_field`:** "Only a tenant admin can change prices" (or
      "…stock settings"). The fields named in `details` are highlighted.
    - **403 `forbidden`:** "You don't have permission to do this."
    - Users API errors are top-level codes, not `invalid_body`, and map to
      fields per §7.
11. **Price fields (`PriceField`):**
    - With `price:write`: a normal ₹ input (whole rupees, > 0; offer
      optional and must be > 0).
    - Without it: read-only text with a lock icon and "Only tenant admins
      change prices". The value is still sent unchanged in whole-object
      saves (the server allows unchanged values).
12. **Restart note (`RestartNote`):** next to every Save that changes what
    a machine shows (products, menu, bases, settings, branding): "Changes
    reach the machine at its next restart."
    - Maintenance says instead: "Takes effect within about 2 minutes."
    - Stock and users show none.
13. **Unsaved changes:** a sticky bar ("Unsaved changes · Discard · Save")
    on the Menu, Bases and Settings tabs. Leaving with unsaved changes asks
    for confirmation (router blocker + `beforeunload`).
14. **Toasts:** short confirmations ("Menu saved. Reaches Bay 02 at its next
    restart"). Errors are never toast-only.
15. **Refresh:** see §2.6. No timers anywhere.

## 5. Pages

Each page lists: purpose; who; API calls; fields and actions per role;
states; refresh; wireframe (desktop; phone differences noted).

### 5.1 Sign in / Change password

- **Purpose:** get a session, and replace a temporary password.
- **Who:** anyone.
- **API:**
  - `POST /auth/login {email, password}` → `{user}`, then `GET /auth/me`;
  - `POST /auth/password {current, new}` → `{user}` (a fresh cookie; other
    sessions end);
  - `POST /auth/logout`.
- **Sign in:**
  - Email and password, with show/hide on the password.
  - Errors:
    - 401 `invalid_credentials`: "Email or password is wrong" (never says
      which);
    - 429 `too_many_attempts`: "Too many attempts. Try again in 15 minutes";
    - 403 `tenant_disabled`.
  - After success: `must_change_password` → Change password, else the
    landing page (§3.2).
- **Change password (forced):**
  - Shown alone (no nav): "Choose your own password to continue", with
    Current (the temporary one), New and Repeat, plus the rule "10 or more
    characters".
  - Errors:
    - 400 `wrong_password`: "Current password is wrong";
    - `same_password`: "Choose a different password";
    - `weak_password`: the rule.
  - Sign out is available.
- **Change password (voluntary):** the same form, from the account menu.
  It notes that other sessions sign out.
- **States:** a submit spinner. Nothing is stored in the browser.

```
┌──────────────────────────────────────────┐
│               [FB] FUELBOT               │
│  SIGN IN                                 │
│  Email     [____________________]        │
│  Password  [________________] [show]     │
│  (!) Email or password is wrong          │
│  [        Sign in         ]              │
│  MONO: FUELBOT DASHBOARD · SESSIONS 48 H │
└──────────────────────────────────────────┘
```

### 5.2 Fleet (staff landing)

- **Purpose:** every machine in every tenant, problems first.
- **Who:** `platform_admin`.
- **API:**
  - `GET /fleet` → `{items: [machine platform view + today], tenants: [{id, name, machines, counts}], tz}`;
  - `GET /stock?state=empty,low,refill_needed`, only when the "Refill soon"
    panel is opened.
- **Content:**
  - Summary chips: Offline n · Fault n · Maintenance n · OK n (click to
    filter).
  - Tenant filter and search (name or id).
  - Groups per tenant, each with a header (name, counts).
  - Rows sorted offline > fault > maintenance > ok, then by name. Each row:
    machine name + id, a `StatusBadge`, fault codes with "since"
    (`faults[]`), the maintenance message if on, last seen (relative), and
    today (orders, ₹ revenue, not dispensed n).
  - A row opens the machine page. Collapsed at the bottom: "Refill soon
    (n)".
- **States:**
  - Empty: "No machines registered yet."
  - A machine with `configured:false` shows a "Not configured" chip.
  - A disabled machine is greyed with a "Disabled" chip.
- **Refresh:** the button.
- **Phone:** the chips scroll horizontally; each machine is a card.

```
FLEET                                        Updated 12:42 IST [↻ Refresh]
[Offline 1] [Fault 1] [Maintenance 0] [OK 5]   Tenant [All ▾]  [Search…]
── PowerFuel Gym · 2 machines ─────────────────────────────────────────
 ● FAULT   Bay 02  DEV00001   HOMING_TIMEOUT since 09:42   seen just now   ₹1,705 · 18 · 1 ND
 ● OK      Bay 3   SHC816DJ                                 seen 1 min ago  ₹575 · 6
── Globex Fitness · 0 machines ── (No machines registered yet)
▸ Refill soon (4)
```

### 5.3 Tenant Home (tenant landing; staff in a tenant)

- **Purpose:** today at a glance, plus what needs attention.
- **Who:** all roles (operators and viewers see their machines only; the
  server scopes the data).
- **API:**
  - `GET /fleet?tenant=<tid>`: KPIs (sum of `today` across machines) and the
    machine list;
  - `GET /sales/summary?group=day&tenant=<tid>&from=<today−13d>&to=<tomorrow>`: the revenue chart;
  - `GET /sales/summary?group=flavor&tenant=<tid>&from=…&to=…`: flavor mix;
  - `GET /stock?tenant=<tid>&state=empty,low,refill_needed`: top 5 for Refill soon;
  - `GET /tenants/:tid/products?archived=true`: flavor names.
- **Content:**
  - KPIs: Revenue today, Orders, Not dispensed (count + ₹, links to the
    Not-dispensed list), Machines (online/total, and how many are out of
    service).
  - Revenue chart: 14 days, with a Day/Week/Month switch that changes the
    range to 14 days / 12 weeks / 12 months.
  - Flavor mix: same range.
  - Machines (status + today).
  - Refill soon (top 5 + "Stock →").
- **Roles:** all read-only. There are no actions on Home.
- **States:**
  - A tenant with no machines: "No machines yet", plus Register for
    tenant_admin+.
  - No sales in the range: the charts show "No sales in the last 14 days".
- **Refresh:** the button (refetches all five).
- **Visual:** the mock-ups `design/home-desktop.png`, `home-tablet.png`
  and `home-phone.png`.

```
[PF] PowerFuel Gym                                       (O) Owner ▾
SUNDAY 28 SEP 2026
TODAY                                          Updated 12:42 IST [↻]
[REVENUE ₹2,280][ORDERS 24][NOT DISPENSED 1 · ₹95 →][MACHINES 2/2 · 1 out of service]
┌ Revenue  [Day|Week|Month] ─────────────┐ ┌ Flavor mix ─────────────┐
│ ▇ ▇ ▅ ▇ ▇▒ ▆ ▃ ▇▒ ▇ ▇ ▅ ▇▒ ▄ ▇▒          │ │ Electrolyte ███████ ₹3,565│
└─────────────────────────────────────────┘ └─────────────────────────┘
┌ Machines ───────────────────────────────┐ ┌ Refill soon ────────────┐
│ Bay 02 DEV00001 ●Online [Out of service]│ │ EMPTY Guava  Bay02 h1  0 │
│ Bay 3  SHC816DJ ●Online  In service     │ │ LOW   Choc   Bay02 h2 12 │
└─────────────────────────────────────────┘ └─────────────────────────┘
```

### 5.4 Machines list

- **Purpose:** find a machine; register one.
- **Who:** all (a scoped list).
- **API:** `GET /fleet?tenant=<tid>`. It's the same data as Home: status,
  today, and `configured`.
- **Columns:**
  - Name + id
  - Status: tenant view Online/Offline + In/Out of service; staff get the
    full badge
  - Last seen
  - Today (₹, orders)
  - Menu (n items, or "Not configured")
  - Location
- **Actions:** **Register a machine** (`machines:manage`). A row opens the
  machine page.
- **States:** empty, as on Home. An operator limited to machines sees only
  those.

```
MACHINES                                   Updated 12:42 [↻] [+ Register a machine]
[Search…]
MACHINE                 STATUS                        LAST SEEN     TODAY          MENU
Bay 02 · DEV00001       ●Online  [Out of service]     just now      ₹1,705 · 18    6 items
Bay 3 by the lockers    ●Online   In service          1 min ago     ₹575 · 6       6 items
 · SHC816DJ
Bay 4 · K7Q2M9XA        ○Offline                      never         —              [Not configured]
```

### 5.5 Register a machine + provisioning card

- **Purpose:** a new machine goes from nothing to provisioned without a
  typo.
- **Who:** `machines:manage` (tenant_admin, platform_admin); the key step
  needs `keys:manage` (same roles).
- **Step 1, Details:**
  - Name (required, ≤ 80), "Location label on the kiosk" (≤ 60, e.g.
    `FUELBOT · BAY 03`), Site (≤ 80).
  - `POST /tenants/:tid/machines` → `{machine}` (201), with the id
    generated.
- **Step 2, Menu:**
  - "Copy the menu from…" (a list of configured machines):
    `POST …/machines/:mid/menu/copy-from/:src` with
    `If-Match: <menu_version>` (0).
  - Or "Build the menu": opens the Menu tab.
  - Or "Later": the machine stays "Not configured", and its config call
    answers 409 until then (the kiosk keeps its cache).
- **Step 3, Key:**
  - Label (default: the machine name).
  - `POST …/machines/:mid/keys {label}` → `{key, machine_key}` (201). **The
    key appears here once.**
- **Provisioning card** (shown after step 3, and printable):

```
┌ PROVISION MACHINE ───────────────────────────────────────── [Print] ┐
│ ⚠ The key is shown ONCE. Write it down or print this card now.        │
│   FuelBot can't show it again; you'd have to issue a new one.         │
│                                                                       │
│ tenant_id.txt    powerfuel                              [Copy]        │
│ machine_id.txt   S H C 8 1 6 D J                        [Copy]        │
│ machine_key.txt  7KQM - 2XPA - 9TRD - 4WZC - HN3B        [Copy]        │
│                                                                       │
│ Typing tips: machine ids use A–Z and 0–9 (0 = zero, has a dot).       │
│ Keys never contain 0, O, 1, I or L. Case, spaces and dashes don't      │
│ matter.                                                               │
│ [ ] I've written down or printed the key          [Done] (disabled    │
│                                                    until ticked)      │
└───────────────────────────────────────────────────────────────────────┘
```

- **Card rules:**
  - Big JetBrains Mono, grouped for reading: ids 28 px (desktop) / 22 px
    (phone); the key 25 / 19 px so its five groups stay on one line. On
    phone, Copy sits under each value (mock-ups `design/provisioning-*.png`).
    Copy puts the canonical value (`SHC816DJ`, `7KQM-2XPA-9TRD-4WZC-HN3B`)
    on the clipboard.
  - The key lives in component state only. It's cleared on Done, on
    leaving the page, and on unmount. There's no "show again".
  - Print uses a print stylesheet: the card only, without the checkbox.
  - Leaving before ticking asks: "You haven't confirmed you saved the key.
    Leave anyway?"
- **Errors:** 400 `invalid_body` → fields. 403 → Not available.

### 5.6 Machine page

- **Header:** display name, id (copy), `StatusBadge` (per view), last seen,
  location/site, "Not configured"/"Disabled" chips.
- **Tabs:** a scrollable bar on phone. Each tab is its own route
  (`/t/:tid/machines/:mid/<tab>`).
- **Common API:** `GET /tenants/:tid/machines/:mid` → `{machine}`, which
  includes `menu`, `bases`, `menu_version`, and for staff `maintenance`,
  `faults`, `status`, `last_seen_ip`. Tenant views have none of these
  (captured).

| Tab | Who sees it | Who edits |
|---|---|---|
| Menu | all | `menu:edit` (operator+); price column `price:write` |
| Config preview | all (`catalog:read`) | – |
| Stock | all | `stock:write` (refill, adjust, threshold) |
| Sales | all (`sales:read`) | – |
| Settings | all | `machines:manage` |
| Bases | all | `machines:manage` |
| Keys | `keys:manage` only | `keys:manage` |
| Maintenance | platform only | `maintenance:write` |
| Telemetry | platform only | – |
| Faults | platform only | – |

#### 5.6.1 Menu tab

- **API:**
  - read: the machine; `GET /tenants/:tid/products` (picker, names,
    default prices);
  - save: `PUT …/machines/:mid/menu {menu: [...]}` with
    `If-Match: <menu_version>`;
  - copy: `POST …/menu/copy-from/:src`.
- **Items in order.** Drag to reorder (with ↑/↓ buttons for keyboard and
  touch). Each row:
  - product (name + small image, or a placeholder);
  - hopper (select 1–6);
  - price: "Product price ₹75 ~~₹90~~" or an override (actual, offer), via
    `PriceField`; the override is set or cleared with "Use product price";
  - badge (text ≤ 20; suggestions POPULAR, NEW);
  - Sold out (toggle);
  - Enabled (toggle);
  - Remove.
- **Add product:** a picker of non-archived products not on the menu. At
  most 12 items (server limit).
- **Client pre-checks** (warnings, before the server's 422):
  - hopper unique among enabled items;
  - at least one item;
  - hoppers 5–6 get an info line: "Hoppers 5–6 need wiring on real machines"
    (kiosk open item).
- **Save** sends the whole menu, keeping `low_portions` from the loaded
  item (so a save doesn't clear it). It carries the `RestartNote`.
- **Roles:**
  - operator: all columns but price (read-only `PriceField`);
  - viewer: read-only (no drag, no toggles; no Save bar).
- **States:**
  - "Not configured": an empty state with "Add products" and "Copy from
    another machine".
  - 422: the panel, with errors mapped to rows by product id prefix
    (`"chocolate: …"`).

```
MENU · Bay 02                                      [Copy menu from… ▾]
 ⠿ 1 [img] Prymor Guava   Hopper [1▾]  ₹75 ~~₹90~~ (product) [Override]  Badge [POPULAR]  Sold out [ ]  On [✓]  [✕]
 ⠿ 2 [img] MMN Chocolate  Hopper [2▾]  ₹180 🔒 (operator)                 Badge [      ]  Sold out [ ]  On [✓]  [✕]
 [+ Add product]
──────────────────────────────────────────────────────────────────────────
 Unsaved changes · Changes reach the machine at its next restart   [Discard] [Save]
```

- **Phone:** each item is a card. The reorder handle is on the left, and
  the fields stack.

#### 5.6.2 Config preview tab

- **API:** `GET …/machines/:mid/config` → `{configured, config, errors[]}`.
  Tenant users get no `maintenance` block (captured).
- **Content:**
  - If `errors` is non-empty: a red panel "The machine would reject this
    config", listing them.
  - `version`.
  - A kiosk-like preview: header (logo_text, display name, location label),
    flavor cards in menu order with price, badge, and sold out greyed;
    disabled flavors hidden, as the kiosk does. Bases listed.
  - A **Raw JSON** toggle (`<pre>` + Copy).
- **Not configured:** "This machine has no menu yet; it's running on its
  cached or bundled catalog."
- **Staff** also see the maintenance block.

#### 5.6.3 Stock tab

- **API:**
  - `GET …/machines/:mid/stock` → `{items: [{hopper, product_id, product_name, portion_g, low_portions, last_refill{kind, product_id, level_g, at, by}, doses_since, left_g, portions_left, days_left, state}]}`;
  - `GET …/stock/history?limit=20` (cursor);
  - `POST …/stock/refills` / `…/stock/adjustments {hopper, level_g, note?}`;
  - threshold: `PATCH …/menu/:pid {low_portions}` with
    `If-Match: <menu_version>`.
- **One card per hopper:**
  - hopper number, product, `StockChip`;
  - big "portions left" and "≈ days left";
  - a bar of `left_g` against the last level;
  - "Last refill 2,000 g · 26 Sep 18:10 · by owner@…";
  - "Low below 15 portions" (editable with `stock:write`);
  - "Portion 32.5 g": a link to the product; "not set" makes the state
    `not_estimated`, with a hint.
- **State texts:**
  - `unknown`: "No refill recorded yet"
  - `refill_needed`: "Hopper now holds X per the menu, but the last refill
    was Y. Record a refill."
  - `not_estimated`: "Set the product's portion size to estimate"
- **Actions (`stock:write`):**
  - **Record refill** / **Adjust**: a dialog with hopper (preset), "Product
    in this hopper: Electrolyte" (read-only; the server records the menu's),
    level after filling in grams (0–50,000), and a note (≤ 200).
    - The adjustment explains: "Use after weighing the hopper."
    - After saving, the tab refetches the stock and history.
- **History:** a list (when, kind, hopper, product, level, by, note) with
  Load more.
- **Viewers and operators:** no buttons.
- **Phone:** hopper cards stack, each with full-width Record refill /
  Adjust buttons (the technician use case). There's no sticky page-level
  button: the mock-up showed it covering the cards' own buttons. The dialog
  opens as a bottom sheet (`design/stock-phone.png`,
  `design/stock-refill-phone.png`).

```
STOCK · Bay 02                                   Updated 12:42 [↻]
┌ HOPPER 1 · Prymor Guava  [EMPTY] ┐ ┌ HOPPER 2 · MMN Chocolate [LOW] ┐
│ 0 portions                        │ │ 12 portions · ≈ 1.5 days      │
│ ▕░░░░░░░░░░░░░░▏ 0 / 700 g        │ │ ▕███░░░░░░░░░░▏ 390 / 2,000 g │
│ Last refill 700 g · 28 Sep 12:42  │ │ Low below [15] portions        │
│ [Record refill] [Adjust]          │ │ [Record refill] [Adjust]       │
└───────────────────────────────────┘ └────────────────────────────────┘
HISTORY  28 Sep 12:42 · Refill · h3 Electrolyte · 2,000 g · ops@… · "full"
```

#### 5.6.4 Sales tab

The Sales page (§5.7) with `machine=<mid>` fixed. The machine filter is
hidden.

#### 5.6.5 Settings tab

- **API:** `PATCH /tenants/:tid/machines/:mid {name, location_label, site, support_phone, idle_video_url, disabled}`
  with `If-Match: <menu_version>`.
- **Fields:**
  - Name (≤ 80)
  - Location label (≤ 60, "on the kiosk header")
  - Site (≤ 80)
  - Support phone (≤ 30, "empty = the company's")
  - Idle video URL (https, advanced)
- **Danger zone:** Disable / Enable machine (with confirmation).
- **Roles:** read-only without `machines:manage`. Save carries the
  `RestartNote`.

#### 5.6.6 Bases tab

- **API:** `PUT …/machines/:mid/bases {bases: [{id, name, code, enabled}]}`
  with `If-Match`.
- **Rows:** id (slug), name (≤ 40), code (`B<digit>`, "the bridge's base
  number"), enabled. Add/remove, max 6.
- **Client checks:** at least one enabled; ids unique.
- Save carries the `RestartNote`. Read-only without `machines:manage`.

#### 5.6.7 Keys tab (`keys:manage`)

- **API:**
  - `GET …/machines/:mid/keys` → `{items: [{id, prefix, label, created_at, created_by, last_used_at, revoked_at}]}`;
  - `POST …/keys {label}` → the provisioning card (§5.5 step 3);
  - `DELETE …/keys/:kid` (revoke).
- **Table:** Prefix (`SU8B…`), Label, Created, Last used (relative; "never"),
  Status (Active/Revoked).
  - `created_by` is a user id: it's resolved from the users list when the
    caller may list users, and "—" otherwise.
- **Guidance line:** "To replace a key: issue a new one, type it into the
  machine, check Last used changes, then revoke the old one."
- **Revoke:** with confirmation (§4.9).

```
KEYS · Bay 3                                               [+ Issue a new key]
To replace a key: issue a new one, type it into the machine, check "Last used", then revoke the old one.
PREFIX   LABEL             CREATED          LAST USED     STATUS
SU8B…    Bay 3 first key   28 Sep 12:42     never         Active    [Revoke]
DEVK…    dev seed          28 Sep 12:41     just now      Active    [Revoke]
```

#### 5.6.8 Maintenance tab (platform)

- **API:** `PUT …/machines/:mid/maintenance {enabled, message, faults[]}`.
  No `If-Match`, by design.
- **Shows:**
  - the current flag, `flagged_by`/`flagged_at`, the message (≤ 300);
  - faults: code ≤ 20 and description ≤ 200, at most 10;
  - separately, "Machine-reported faults (clear automatically)" from
    `faults[]`, which aren't editable.
- **Actions:**
  - Switch on (confirmation, §4.9)
  - Switch off
  - Update the message or faults while on
- The note is "Takes effect within about 2 minutes."

#### 5.6.9 Telemetry tab (platform)

- **API:** `GET /telemetry?machine=<mid>&type=&from=&to=&limit=50` (cursor).
- **List:** time, type, order (links to the order page), result, fault.
- A `dispense_cycle` row expands into a **stage timeline**: a horizontal
  bar with stage markers at `t_offset_ms`, and `duration_ms`.
- **Filters:** type, date range.

#### 5.6.10 Faults tab (platform)

- **API:** `GET /faults?machine=<mid>&from=&to=` → intervals
  `{code, from, to|null, duration_sec|null}`.
- Open faults first ("ongoing since …"), then closed ones with duration.

### 5.7 Sales (tenant and "all tenants" for staff)

- **Purpose:** revenue by day, ISO week and month; by flavor and machine;
  every sale.
- **Who:** all roles (scoped). Staff at `/sales` see all tenants, or pick
  one.
- **Filters** (one row; a sheet on phone), reflected in the URL query:
  - Period presets: Today, Yesterday, Last 7 days, Last 30 days, This
    month, Last month, Last 12 weeks, Last 12 months, Custom (two dates).
    The default is Last 30 days.
  - Group: **Day | Week | Month** (the default comes from the range: ≤ 31
    days → Day, ≤ 26 weeks → Week, else Month).
  - Machine (all / one; only visible machines).
  - Flavor (all / one).
  - Dispensed: All / Dispensed / Not dispensed.
  - Staff also get Tenant (all / one) and Result
    (`success/timeout/rejected/no_response`, which sends `result=` and is
    platform only).
- **API** (the same filter params on each: `tenant`, `machine`, `flavor`,
  `dispensed`, `from`, `to`, and `result` for staff):
  - `GET /sales/summary?group=day|week|month`: chart + totals;
  - `GET /sales/summary?group=flavor`: flavor mix + flavor table;
  - `GET /sales/summary?group=machine` (or `group=tenant` for staff on "All
    tenants"): breakdown table;
  - `GET /sales?limit=50` (+cursor): the table;
  - CSV: `/sales/export.csv?<filters>` (a link).
- **Content:**
  - KPIs: Revenue, Orders, Average (revenue ÷ orders, rounded), Not
    dispensed (count + ₹).
  - **Revenue chart:** bars per bucket; the stacked, hatched segment is the
    not-dispensed amount, with a legend. Tooltip: bucket label (e.g.
    "Week 39 · 22–28 Sep"), revenue, orders, not dispensed.
  - **Flavor mix:** horizontal bars of revenue per flavor (names from
    products), with count in the tooltip.
  - Breakdown tables: By flavor, and By machine (or By tenant). Columns:
    orders, revenue, not dispensed n / ₹, share %.
  - **Sales table:**
    - Time (IST)
    - Order no.
    - Machine
    - Flavor
    - Base
    - Charged (with ~~actual~~ if offer)
    - Payment (UPI)
    - Transaction id (copy)
    - Status: `DispensedChip`. Staff also see the result + reason columns.
  - A row opens the order detail.
- **Staff on "All tenants":** the flavor chart is replaced with "Pick a
  tenant to see flavors" (flavor ids repeat across tenants), and the
  breakdown is By tenant.
- **States:**
  - no sales in range: "No sales in this period" (charts hidden, totals ₹0);
  - loading skeletons per block;
  - a 400 `invalid_from/to` can't happen (dates are built by the UI).
- **Refresh:** the button. Filter changes refetch (debounced).
- **Print:** a "Print report" button (§5.8).

```
SALES                                         Updated 12:42 IST [↻] [Export CSV] [Print]
[Last 30 days ▾] [Day|Week|Month] [Machine: All ▾] [Flavor: All ▾] [All|Dispensed|Not dispensed]
[REVENUE ₹17,385] [ORDERS 183] [AVG ₹95] [NOT DISPENSED 16 · ₹1,540]
┌ Revenue by day ─────────────────────────────────────────┐ ┌ Flavor mix ──────────┐
│ bars… (hatched = not dispensed)       ■ Dispensed ▨ Not │ │ bars…                │
└──────────────────────────────────────────────────────────┘ └──────────────────────┘
BY FLAVOR  (table)                     BY MACHINE  (table)
SALES
TIME (IST)   ORDER  MACHINE  FLAVOR     CHARGED   TXN          STATUS
28 Sep 12:42 4181   Bay 02   Chocolate  ₹95       pay_181 [⧉]  Dispensed
…                                                    [Load more]
```

### 5.8 Not-dispensed work list and print report

- **Not dispensed:**
  - `/t/:tid/sales?view=not-dispensed` (also a tab on the Sales page)
    presets `dispensed=false` and shows a focused table: Time, Order no.,
    Machine, Flavor, Amount charged, Transaction id (copy), and for staff
    Result + Reason.
  - The header note: "Paid orders that weren't dispensed. Refunds are done
    in the Razorpay dashboard; this list doesn't track them."
  - CSV export with the same filter. Read-only.
- **Print report:** `@media print` on the Sales page:
  - hides nav, filters, buttons and the sales table;
  - prints a header (tenant name, period, group, "Generated 28 Sep 2026
    12:42 IST by owner@…"), KPIs, both charts, the breakdown
    tables, and the not-dispensed list (if any);
  - A4 portrait, page breaks between blocks;
  - the e2e test produces a PDF (`page.pdf`) that's looked at.

```
SALES   [Overview | Not dispensed (16)]
Paid orders that weren't dispensed. Refunds are done in the Razorpay dashboard; this list doesn't track them.
[Last 30 days ▾] [Machine: All ▾]                                            [Export CSV]
TIME (IST)     ORDER   MACHINE   FLAVOR        CHARGED   TRANSACTION        (staff: RESULT · REASON)
21 Aug 11:42   4011    Bay 02    Beast Coffee  ₹115      pay_11 [⧉]         timeout · no DONE within deadline
…                                                                            [Load more]
```

### 5.9 Order detail

- **API:** `GET /orders/:orderId` → `{sale}`; staff also get
  `telemetry[]`.
- **Content:**
  - the sale: all tenant-view fields, with `DispensedChip`;
  - staff: `dispensing_result`, `dispensing_reason`, `received_at`,
    `machine_known`, and a stage timeline for each `dispense_cycle` plus a
    list of the other events.
- **404:** "Order not found, or you don't have access."

### 5.10 Stock: refill soon

- **Purpose:** what to refill, across machines. The technician's list.
- **Who:** all (scoped); `stock:write` gets inline Record refill.
- **API:**
  - `GET /stock?tenant=<tid>&state=<chips>`. The default is every state
    except `ok`; the server sorts by urgency.
  - The Record refill dialog POSTs to the machine's route.
- **Content:**
  - State chips (Empty, Low, Refill needed, Unknown, Not estimated).
  - Rows: `StockChip`, product, machine name + hopper, portions left, ≈
    days, last refill.
  - A row opens the machine's Stock tab. Record refill is inline with
    `stock:write`.
- **Empty:** "Nothing needs refilling. Every hopper is above its low mark."
- **Phone:** cards with a large "Record refill" button.

```
REFILL SOON                                                  Updated 12:42 [↻]
[Empty 1] [Low 1] [Refill needed 0] [Unknown 2] [Not estimated 1]
STATE     PRODUCT           MACHINE · HOPPER   PORTIONS   ≈ DAYS   LAST REFILL
EMPTY     Prymor Guava      Bay 02 · 1         0          —        700 g · 28 Sep     [Record refill]
LOW       MMN Chocolate     Bay 02 · 2         12         1.5      2,000 g · 26 Sep   [Record refill]
UNKNOWN   Cookies & Cream   Bay 02 · 5         —          —        never              [Record refill]
```

### 5.11 Products

- **Purpose:** the tenant's product library.
- **Who:** all (`catalog:read`).
  - Create: `products:create` (tenant_admin+).
  - Edit text: `products:edit` (operators with all machines, tenant_admin+).
  - Prices: `price:write`.
  - `portion_g`: `stock:write`.
- **API:**
  - `GET /tenants/:tid/products[?archived=true]` → `{items: [{id, name, description, volume_ml, nutrition, ingredients, allergens, image_url, image, actual_price, offer_price, portion_g, archived, rev, machines[], updated_at}]}`;
  - `GET …/products/:pid`;
  - `POST …/products` (create: `product_id` slug, `name`, `actual_price`
    required);
  - `PATCH …/products/:pid` with `If-Match: <rev>` (incl.
    `archived: true|false`).
- **Table:**
  - Image
  - Name + id
  - Price: offer ~~actual~~
  - Portion (g or "not set")
  - On machines (n, with names in a tooltip)
  - Status: Archived
- Toolbar: search, "Show archived", **New product**.
- **Drawer** (a full-screen sheet on phone):
  - Name (≤ 80);
  - Product id (create only; slug; "used in sales records, can't change");
  - Description (≤ 500);
  - Volume ml;
  - Nutrition: kcal, protein g, carbs g, fat g;
  - Ingredients (tag input, ≤ 50);
  - Allergens (tag input). The kiosk shows a warning banner, and an empty
    list never means "allergen-free", so the help text says "leave empty if
    none declared".
  - Prices: `PriceField` ×2.
  - Portion size g (> 0, ≤ 500, decimals). Help: "Weigh ten portions and
    divide by ten."
  - Image:
    - a preview of `image_url` (https) when set; "Using the kiosk's bundled
      image `prymor_guava.png`" when only `image` is set;
    - the bundled path is editable as text (`res://…`) by `products:edit`;
    - **upload arrives with S5**, so there's no upload control in S7.
  - "On machines: Bay 02, Bay 3".
  - Archive / Unarchive: 409 `product_in_use` → "Remove it from these
    machines' menus first: …".
- **Save:** `If-Match: rev`; 422 lists each affected machine's errors;
  carries the `RestartNote`.
- **Viewer and limited operator:** the drawer is read-only.

```
PRODUCTS                                      [Search…] [ ] Show archived  [+ New product]
IMG  NAME                     PRICE          PORTION   ON MACHINES   STATUS      ┌ Prymor Guava · guava ──────── [✕] ┐
[ ]  Prymor Guava · guava     ₹75 ~~₹90~~    not set   2             ·           │ Name        [Prymor Guava      ] │
[ ]  MMN Chocolate · chocolate ₹180          32.5 g    2             ·           │ Description [Cold-blended …    ] │
[ ]  Old Mango · mango        ₹120           —         0             Archived    │ Volume ml [400]  kcal [210] …    │
                                                                                 │ Ingredients [Whey ✕][Guava ✕][+] │
                                                                                 │ Allergens   [Milk ✕][Soy ✕][+]   │
                                                                                 │ Price ₹[90]  Offer ₹[75]  (🔒 op) │
                                                                                 │ Portion size g [    ]            │
                                                                                 │ Image: bundled prymor_guava.png  │
                                                                                 │ On machines: Bay 02, Bay 3       │
                                                                                 │ Changes reach the machines at    │
                                                                                 │ their next restart. [Archive][Save]│
                                                                                 └──────────────────────────────────┘
```

### 5.12 Users

- **Who:** `users:manage` (tenant_admin: own tenant; platform: all, with a
  tenant filter).
- **API:**
  - `GET /users?limit=50[&tenant=]` (cursor) → `{items: [user view], next_cursor}`;
  - `POST /users {email, name, role, tenant_id?, machines?, password}`;
  - `PATCH /users/:id {name?, role?, machines?, disabled?}`;
  - `POST /users/:id/password {password}`.
- **Table:**
  - Name / email
  - Role
  - Machines ("All machines" or names)
  - Status: Active, Disabled, or "Must change password"
  - Last sign-in
- **Create dialog:**
  - email, name;
  - role: tenant roles; staff also `platform_admin`, with a Tenant select
    for tenant roles;
  - machines (a multi-select, only for operator/viewer; empty = all);
  - temporary password: a **Generate** button makes a typeable 14-character
    one from the same look-alike-free alphabet, with Copy.
  - Shown once in the dialog: "Give this to the user outside the dashboard.
    They'll choose their own at first sign-in."
- **Edit:** name, role, machines.
  - **Disable/Enable**, with confirmation.
  - **Reset password**: a new temporary one, the same flow.
  - Your own row: no role change, no disable (the server says
    `forbidden_self`, and the UI hides both).
- **Errors:** §7.

```
USERS                                   (staff: Tenant [All ▾])            [+ New user]
NAME / EMAIL                     ROLE           MACHINES        STATUS                  LAST SIGN-IN
Owner · owner@powerfuel.example  Tenant admin   All machines    Active                  28 Sep 12:42   [⋯]
Desk · desk@powerfuel.example    Operator       Bay 02          Active                  28 Sep 12:43   [⋯]
Look · look@powerfuel.example    Viewer         All machines    Must change password    never          [⋯]
[⋯] = Edit · Reset password · Disable                                          [Load more]
```

### 5.13 Company (branding)

- **API:**
  - `GET /tenants/:tid` → `{tenant: {id, name, branding{display_name, logo_text, support_phone}, catalog_version, disabled, machine_count}}`;
  - `PATCH /tenants/:tid {name?, branding?}`. Not versioned: the last
    write wins, which is acceptable for rare edits.
- **Fields:**
  - Company name (≤ 100; dashboard only)
  - Display name on kiosks (≤ 60)
  - Logo text (≤ 4 characters, shown in the kiosk's badge; a live preview
    of the badge)
  - Support phone (≤ 30)
- `RestartNote`. Read-only without `tenant:edit`.

### 5.14 Tenants (platform)

- **API:**
  - `GET /tenants`;
  - `POST /tenants {id, name, branding?}`: 409 `tenant_exists` → "That id
    is taken";
  - `PATCH /tenants/:tid {disabled}`.
- **Table:** id, name, machines, created, status.
  - Actions: open (→ that tenant's Home), **New tenant**, Disable/Enable
    (confirmation).
- The id help text: "lowercase letters, digits, - or _; it goes into
  every machine's tenant_id.txt and can't change."

```
TENANTS                                                              [+ New tenant]
ID          NAME             MACHINES   CREATED        STATUS
globex      Globex Fitness   0          28 Sep 2026    Active     [Open] [Disable]
powerfuel   PowerFuel Gym    2          28 Sep 2026    Active     [Open] [Disable]
```

### 5.15–5.18 Staff pages

| Page | API | Content |
|---|---|---|
| **Faults** | `GET /faults[?tenant=&machine=&from=&to=]` | open intervals first ("ongoing"), then closed ones with duration; links to the machine |
| **Telemetry** | `GET /telemetry?tenant=&machine=&type=&order_id=&from=&to=&limit=50` (cursor) | as the machine tab, across machines; `event_type` select from the known list (§3.3 of the server plan) |
| **Audit** | `GET /audit?tenant=&machine=&user=&action=&from=&to=&limit=50` (cursor) | at, user email, action, target, tenant/machine, IP; a row expands to a before/after diff. The user filter is a picker over `/users` |
| **Unregistered machines** | `GET /unregistered` | tenant id claimed, machine id, sales n, telemetry n, first/last seen, "registered under" (another tenant = wrong `tenant_id.txt`). The help text says ids come only from the server, so each row is a typo to fix on the machine |

```
AUDIT   [Tenant ▾] [Machine ▾] [User ▾] [Action ▾] [From] [To]
AT               USER                  ACTION         TARGET       TENANT · MACHINE       IP
28 Sep 12:42     ops@fuelbot.example   stock.refill   hopper:3     powerfuel · DEV00001   127.0.0.1  ▸
  └ after: {product_id: "electro", level_g: 2000, note: "full"}
                                                                                 [Load more]
```

**Shell on phone** (every page):

```
┌───────────────────────────┐
│ [PF] PowerFuel Gym     (O)│  top bar (staff: tenant switcher)
│ SUNDAY 28 SEP             │
│ TODAY           [↻]       │
│ …one column of cards…     │
├───────────────────────────┤
│ Home Sales Stock Mach More│  bottom tab bar; More = Products, Users, Company, (Platform…), Account
└───────────────────────────┘
```

## 6. Permission → UI map

`can()` checks these permission names (from `/auth/me`). "Platform" means
the user holds the platform-only permissions (`telemetry:read` etc.). The
UI checks the specific one, never the role name.

| UI element | Permission |
|---|---|
| Fleet page, "All tenants" in the switcher, the Platform nav group | `telemetry:read` (platform set) |
| Register machine; Settings/Bases edit; Disable machine | `machines:manage` |
| Keys tab and actions | `keys:manage` |
| Menu edit (order, hopper, badge, sold out, enabled, add/remove, copy) | `menu:edit` |
| Price inputs (product defaults and menu overrides) | `price:write` |
| Record refill, Adjust, low threshold, portion size | `stock:write` |
| New product | `products:create` |
| Edit product text and image path, Archive | `products:edit` (already excludes limited operators, §2.5) |
| Users nav and page | `users:manage` |
| Company edit | `tenant:edit` |
| Tenants page, New tenant | `tenants:create`; Disable tenant `tenants:disable` |
| Maintenance tab / actions | `maintenance:read` / `maintenance:write` |
| Telemetry tab + page, Faults tab + page, Audit, Unregistered | `telemetry:read`, `faults:read`, `audit:read`, `unregistered:read` |
| Result filter and reason columns on Sales | `telemetry:read` (platform set). The data is present only in the platform view anyway |

## 7. Error codes → messages (`src/api/errors.js`)

| Code (status) | Where | Message / field |
|---|---|---|
| `invalid_credentials` (401) | sign in | Email or password is wrong |
| `too_many_attempts` (429) | sign in | Too many attempts. Try again in 15 minutes |
| `tenant_disabled` (403) | sign in / any | Your company's access is disabled. Contact FuelBot |
| `wrong_password` / `same_password` / `weak_password` (400) | change / set password | Current password is wrong / Choose a different password / 10 or more characters |
| `invalid_email` / `email_taken` (400/409) | users | email: "Enter a valid email" / "A user with this email exists" |
| `invalid_role` / `role_scope_change` (400) | users | role: "Not allowed" / "Staff and tenant roles can't be swapped" |
| `unknown_tenant` (400) | users (staff) | tenant: "No such tenant" |
| `unknown_machine` / `machines_not_allowed` (400) | users | machines: "Unknown machine" / "Only operators and viewers are limited to machines" |
| `forbidden_self` (403) | users | You can't change your own role or disable yourself |
| `last_tenant_admin` / `last_platform_admin` (409) | users | Every company needs an active admin / There must be an active FuelBot admin |
| `invalid_body` (400) | all writes | per field from `details[{field, error}]` (server text, e.g. "whole rupees > 0") |
| `invalid_config` (422) | products, menu, bases, settings | "The machine would reject this": per machine, the app's strings |
| `version_conflict` (409) | versioned writes | the Conflict dialog |
| `if_match_required` (428) | versioned writes | generic error (a bug) |
| `forbidden_field` (403) | products, menu | Only a tenant admin can change prices / stock settings |
| `forbidden` (403) | any | You don't have permission to do this |
| `product_in_use` (409) | archive | Remove it from these machines' menus first |
| `product_exists` / `tenant_exists` (409) | create | That id is taken |
| `source_not_configured` (400) | copy menu | That machine has no menu to copy |
| `not_found` (404) | any | Not found, or you don't have access |
| network error | any | You're offline, or the server isn't reachable |

## 8. Server changes in S7 (stories SRV-27–SRV-29, SRV-31)

1. **SRV-27:**
   - `group=week|month` on `/sales/summary`: keys `2026-W39` / `2026-09`
     in `DISPLAY_TZ`, sorted ascending like `day`;
   - `local_time` as the first CSV column (`2026-09-28 12:42:02`,
     `DISPLAY_TZ`) in both column sets;
   - a `tenant` filter on `/fleet` and `/stock`: platform any; tenant users
     own only, else 404, like `scopedFilter`.
2. **SRV-28:** `/auth/me` adds `permissions`, `all_machines`, `tenant`,
   `display_tz`, `session_expires_at`.
3. **SRV-29:** serves `DASHBOARD_DIR` at `/dashboard` with the dashboard
   CSP, cache headers, SPA fallback, the "not built" page, and `/` →
   `/dashboard/`. New settings: `DASHBOARD_DIR`, `IMAGE_ORIGINS`.
4. **SRV-31:** `startServer(env, {port})` in `server/test/helpers.js`, for
   the browser tests' fixed port.

None changes the kiosk contract (§3), so no app change is needed. The RBAC
table test keeps every row. New routes: none, only new query params and
fields; SRV-27 adds rows for `/fleet?tenant=globex` and
`/stock?tenant=globex` (404 for tenant roles).

## 9. Spikes (2026-09-28; throwaway code, not committed)

| # | Spike | Result |
|---|---|---|
| A | A Vite 8 + React 19 production build (`base: '/dashboard/'`), served by the real `createApp` behind helmet: (a) the default CSP, (b) the strict dashboard CSP of §2.4. Headless Chrome via Playwright 1.63 at 390 and 1440 px | **Pass.** The build emits only `<script type="module" src>` and `<link rel=stylesheet>` (no inline code). **0 CSP violations** under both policies. Archivo loaded from a hashed asset (`document.fonts.check('900 20px Archivo')` true). Deep link `/dashboard/sales` served `index.html` and routed. An SVG chart rendered with CSS-variable fills. Default helmet `upgrade-insecure-requests` didn't break `http://127.0.0.1`, but is kept for production only |
| B | Cookie auth and CSRF from `fetch` (built app and Vite dev proxy on :5199 → :8890) | **Pass.** `POST /auth/login` with `X-Requested-With` set `fb_session` (httpOnly, SameSite=Strict, not Secure in dev). `document.cookie` was empty (invisible to JS). `/auth/me` and `/sales/summary` worked with the cookie. A POST without the header → **403** `csrf_header_required`. The same works through the Vite dev proxy. Expected 401/403s appear as console "Failed to load resource" lines, so the e2e harness fails on CSP violations and page errors, not on console resource errors |
| C | Mongo `$dateToString` `%G-W%V` and `%Y-%m` with `timezone: 'Asia/Kolkata'` (MongoDB 8.2.6, the version `mongodb-memory-server` runs) | **Pass on all 8 edge cases:** Sun 27 Sep 23:59 IST → `2026-W39`, Mon 00:00 → `2026-W40`; 1 Jan 2027 and 3 Jan 2027 → `2026-W53`; 4 Jan 2027 → `2027-W01`; 29 Dec 2025 → `2026-W01`; 30 Sep 23:59 IST → `2026-09`, 1 Oct 00:00 → `2026-10`. Keys sort chronologically as strings |
| D | Headless browser test that signs in and screenshots | **Pass** with Playwright's `channel: 'chrome'` (the installed Chrome; no browser download), at phone and desktop widths. Screenshots were looked at. Lesson: an SVG with a fixed `width` overflows at 390 px, so charts use `viewBox` + `width: 100%` |
| E | Fonts for phones | The kiosk's TTFs subset with `pyftsubset` (Latin-1, `₹`, dashes, quotes, bullets, arrows; both variable axes kept) → Archivo **88 KB**, JetBrains Mono **39 KB** WOFF2 (from 658 KB + 187 KB); `₹` present |
| F | Chart palette | Validated with the dataviz checker: `#4D7C0F` / `#9D3FD6` on white pass lightness, chroma, colour-blind separation and contrast. Rejected: green/orange pairs (colour-blind ΔE 1.3–6.6). A dark pair (`#7A9F28` / `#AF6ADF`) also passed, for a later dark theme |
| G | **Ant Design 6.6.5 under the strict CSP** (after the product owner chose antd). A Vite build of one page with antd `Layout`/`Sider`, `Menu`, `Card`, `Statistic`, `Segmented`, primary `Button`, `DatePicker.RangePicker` (opened), `Select`, `Tag`, `Table`, `Drawer` (opened) and `message` (shown), with the FuelBot theme; four ways, in headless Chrome | **(A) as-is under `style-src 'self'`:** 63 violations; components unstyled (the primary button grey). **(B) `zeroRuntime` + `antd/dist/antd.css`** and **(C) `zeroRuntime` + our theme's CSS pre-built with `@ant-design/static-style-extract`:** both still add 19 `<style>`s at runtime (the theme's CSS variables), with 22 violations. Their component class hashes don't match the pre-built file, so the button is unstyled. Not usable with a custom theme in 6.6.5. **(D) runtime styles + per-request nonce** (`<meta name="csp-nonce">` filled by the server, `ConfigProvider csp={{nonce}}`): 3 violations left, all from antd's helper library (a scrollbar measure and the drawer's body scroll lock), which ignores the provider. Adding `src/nonce.js` (imported first; stamps the nonce on every `<style>` the page creates) gave **0 violations and no `unsafe-inline`**. The theme applied: the primary button computed `rgb(200,255,62)` with `rgb(17,18,21)` text. The picker, drawer and toast all worked. **Size:** the JS bundle for that page was 1.09 MB (**346 KB gzip**), with React and antd. The real app should split code per route (`React.lazy`) so the first load stays near that |

API captures (the same session, a scratch server on :8890, seeded with 183
sales over 41 days, all four roles). Findings that shaped this plan:
- the tenant views have no `maintenance`, `faults`, `status`, `last_seen_ip`
  or `dispensing_*`;
- a limited operator gets 403 `forbidden` (not `forbidden_field`) on any
  product PATCH;
- summaries and sales rows carry ids, not names;
- the CSV has UTC times only;
- `last_refill.by` is an email (visible to tenant users);
- key `created_by` is a user id;
- users API errors are top-level codes;
- `weak_password` has a string `details`.

## 10. Risks and open questions

1. ~~TypeScript?~~ **Answered (product owner, 2026-09-28): JavaScript.**
   JSDoc on the API client helps editors.
1a. **Ant Design risks:**
   - **The nonce setup depends on how antd and its helpers create
     styles.** An antd upgrade could add a style path the nonce doesn't
     reach. The e2e guard fails on any CSP violation, so a regression shows
     up in the first test run after an upgrade.
   - **Bundle size:** 346 KB gzip for one antd page (spike G), against
     about 100 KB hand-written. It's mitigated by splitting code per route.
     Check on a mid-range phone over 4G at SRV-49.
   - **Major versions** (v5 → v6 changed the styling engine) come about
     every two years. Pin to `^6` and upgrade deliberately.
   - **The look** is Ant Design wearing our colours. The mock-ups are
     layout guides, not pixel targets.
2. **Deploy builds the dashboard.** With a build step, whoever deploys runs
   `npm ci && npm run build` in `webdashboard/`. The deploy milestone must
   include it (no hosting decision yet, server plan §9.1).
3. **Images under CSP:** product images from hosts other than the S3 bucket
   or `PUBLIC_URL` are blocked unless listed in `IMAGE_ORIGINS`. They show a
   placeholder.
4. **Staff emails shown to tenants:** `last_refill.by` shows the email of
   whoever recorded a refill, including FuelBot staff. Acceptable? (It isn't
   on the platform-only list.)
5. **`/stock` cost** grows with machines × hoppers (1–3 queries each). With
   no auto-refresh it's bounded by clicks. Revisit (one aggregate) past
   about 200 machines.
6. **Refund process** (server plan §9.6) is still open. The Not-dispensed
   list is ready for a "refunded" mark later.
7. **Hoppers 5–6** aren't wired on real machines (kiosk open item). The
   Menu tab warns but allows them, as the server does.
8. **The 48 h fixed session** can end mid-edit. It's mitigated by the
   expiry banner and by keeping form state in memory across the 401.
