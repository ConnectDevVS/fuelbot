# webdashboard/CLAUDE.md

Rules for working on the web dashboard. The backend's rules are in
[server/CLAUDE.md](../server/CLAUDE.md); the root [CLAUDE.md](../CLAUDE.md)
covers the Godot kiosk, which S7 never touches.

- **Spec:** [devdocs/plans/dashboard-plan.md](devdocs/plans/dashboard-plan.md)
  ("DP"). Stories: [devdocs/stories/dashboard/](devdocs/stories/dashboard/README.md),
  one commit per story, `SRV-NN: <title>`. If the code shows the plan is
  wrong, fix the plan in the same commit.
- The API is the server's (`/api/v1`, [server plan §4](../server/devdocs/plans/server-plan.md)).
  Check shapes against the real server, not prose.

## Commands (run from `webdashboard/`)

- `npm run dev`: Vite on **:5173** (strict port), proxying `/api` and
  `/files` to `DASHBOARD_API_URL` (default `http://127.0.0.1:8790`: start the
  server first, see server/README.md).
- `npm run build`: `dist/` (never committed). The server serves it at
  `http://127.0.0.1:8790/dashboard/` with the real CSP.
- `npm test`: vitest (jsdom; files that only read files use
  `// @vitest-environment node`). `test/build.test.js` builds into a temp dir.
- `npm run lint`: eslint (the security bans below are lint errors).
- `npm run e2e`: build, then Playwright (`e2e/`): the seeded server on
  **:8795** (`e2e/server.mjs`, in-memory Mongo), installed Chrome, headless,
  phone 390 / tablet 820 / desktop 1440. Import `test`/`expect` from
  `e2e/fixtures.js`: its auto `guard` fails on CSP violations, page errors
  and horizontal overflow; `signInAs(key)` (keys of `USERS` in
  `e2e/seed.mjs`), `shot(name)`, `resetData()` after writes. API-only
  specs run on the desktop project only. `E2E_CHANNEL=chromium` after
  `npx playwright install chromium` (ask before downloading).
- **Gate for a story:** `cd server && npm test && cd ../webdashboard && npm run lint && npm test && npm run build && npm run e2e`,
  chained with `&&`, then stage the story's files explicitly (never
  `git add -A`) and commit.

## Rules

- **No inline code.** No inline `<script>`/`<style>`/`style=` in
  `index.html`, no `dangerouslySetInnerHTML`, `innerHTML` or `eval` (lint).
  Styles come from our CSS files or antd's runtime styles carrying the nonce.
- **`src/nonce.js` must stay the first import in `src/main.jsx`.** It
  stamps the per-request CSP nonce (`<meta name="csp-nonce">`, filled by the
  server, `server/src/dashboard.js`) on every `<style>` the page creates;
  antd's helper library creates some that `ConfigProvider csp` misses
  (spike G). Never add `unsafe-inline` to the CSP to "fix" a violation.
- **`App.useApp()` for `message` and `modal`.** The static
  `message.*`/`notification.*`/`Modal.confirm()` miss the theme and the
  nonce (lint bans them).
- **antd through our `src/ui/` wrappers** (DP §4), so pages use our names
  and antd details live in one place. Hand-written SVG charts only.
- **No secrets anywhere but component state.** No password or machine key
  in a URL, `localStorage`/`sessionStorage` (lint bans both: the dashboard
  stores nothing in the browser), the React Query cache, or a `console.*`
  call (`no-console` in `src/`). The machine key is fetched outside React
  Query and cleared on leave.
- Every non-GET sends `X-Requested-With: fuelbot-dashboard` (the API
  client does it).
- **Permission-based hiding only:** `can('<permission>')` from `/auth/me`,
  never a role name (DP §6). The UI only hides; the server enforces.
- **Platform-only data never reaches a tenant screen** (telemetry,
  maintenance, faults, failure reasons, audit, unregistered machines). A
  failed sale is "Not dispensed".
- **Strings** only in `src/strings.js` (`t(key, params)`).
- **Colours** only in `src/theme/palette.js` and `src/styles/tokens.css`
  (kept identical by a test; another test fails on a hex/rgb literal
  anywhere else in `src/`). Light theme only. The lime is a fill with dark
  text, never text on white and never a chart mark.
- CSS Modules (`*.module.css`) for layout and our own pieces; no CSS
  framework besides antd.
- **Pages are data:** `src/shell/pages.js` lists every URL with the
  permission(s) it needs, its title and nav placement (DP §3). A story that
  builds a page adds its lazy component to `COMPONENTS` in
  `src/shell/routes.jsx`; until then the page is a "Coming in SRV-NN"
  placeholder. The router wraps each page in `TenantScope` (for `/t/:tid/…`:
  another tenant is Not found, with no request for tenant users) and `Gate`
  (Not available, and the page never mounts). "Staff" in the UI means
  `can('telemetry:read')`, never a role name.
- **Look at every screenshot** a UI story produces (`.screenshots/`, at
  390 / 820 / 1440): overflow, clipping, wrong role controls, unreadable
  states. Say in the commit message that you looked.

## Gotchas (spikes and stories)

- **antd `zeroRuntime` / pre-built CSS doesn't work with a custom theme in
  6.6.5** (spike G): component class hashes don't match. Don't retry it
  without upgrading.
- antd `List` is deprecated in 6.6: phone card lists use `Card`s.
- Charts: an SVG with a fixed `width` overflows at 390 px. Use `viewBox` +
  `width: 100%`.
- In a CSS grid layout, `main` needs `min-width: 0`, or a wide child makes
  the page scroll sideways.
- Expected 401/403s show as console "Failed to load resource" lines. The
  e2e guard fails on CSP violations and page errors, not on those.
- jsdom: antd needs `matchMedia` and `ResizeObserver`, and calls
  `getComputedStyle(el, pseudo)`; `src/test/setup.js` provides/quiets them.
- The dev seed's `DEV00001` (`npm run seed`) has an empty `name` (the e2e
  seed calls it Bay 02): show `name || location_label || id`. Summaries and sales carry ids, not
  names (resolve via products `?archived=true` and machines).
- JetBrains Mono has no `₹`; Archivo is its fallback in `--fb-font-mono`.
- The shell is zsh (`${var^^}` fails; unquoted `$var` isn't word-split).
- Headless browser only: headed windows pop up in front of the user.
- `npx playwright test` serves whatever is in `dist/`: after changing `src/`,
  use `npm run e2e` (it builds first), or the screenshots show old code.
- Never keep a password in a React Query mutation (`useMutation` keeps its
  variables in the cache): sign-in and password changes are plain async
  calls (`src/auth/session.js`).
- antd derives `colorWarningBg`/`colorErrorBg` from our dark status
  colours (a muddy fill), so `antdTheme.js` sets them from the palette.
- The e2e seed runs through the server's own modules
  (`../../server/src/…`, `../../server/test/helpers.js`), which resolve
  their packages from `server/node_modules`: run `npm ci` in `server/` too.
  Don't import `mongoose` from `webdashboard/` (not installed here).
- The seed's stock states are exact because refills are stamped after
  every seeded dose; keep new seeded sales older than `now - 10 min`.
