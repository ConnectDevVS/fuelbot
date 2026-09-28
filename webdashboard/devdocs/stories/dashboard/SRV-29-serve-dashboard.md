# SRV-29: Serve the dashboard (static, SPA fallback, CSP)

**As** anyone opening `https://<host>/dashboard/`, **I want** the built
dashboard served by the same process as the API, under a strict content
security policy, **so that** it runs same-origin with the session cookie
and nothing injected can execute.

- **Refs:** SP §2.3 (one app, two faces), §4.6 (helmet, CSP), §4.12
  (settings); DP §2.4. Spike A (a Vite build under this CSP: 0 violations).
- **Depends on:** nothing (it serves a folder that SRV-30 fills). **Server
  only.**

## Deliverables

1. `server/src/settings.js`:
   - `dashboardDir` (`DASHBOARD_DIR`, default
     `new URL('../../webdashboard/dist/', import.meta.url).pathname`);
   - `imageOrigins` (`IMAGE_ORIGINS`, a comma list of `https://` origins;
     invalid entries throw at boot).
2. `server/src/dashboard.js`: `dashboardRouter(settings)`.
3. `server/src/app.js`:
   - mount `/dashboard` before the 404 handler;
   - `GET /` → 302 `/dashboard/`;
   - log once at boot if `index.html` is missing.
4. `server/.env.example`: `DASHBOARD_DIR`, `IMAGE_ORIGINS`.
5. `server/test/dashboard.test.js`.
6. Docs:
   - SP §4.6 (the dashboard CSP), §4.12 (settings), §5 (folder: the
     dashboard lives in `/webdashboard`, `server/public/` is dropped);
   - `server/README.md` ("Dashboard": build it, then open `/dashboard/`);
   - `server/CLAUDE.md` (one line: the dashboard CSP lives in
     `src/dashboard.js`).

## Spec

- **CSP:** `helmet({ contentSecurityPolicy: { useDefaults: false, directives } })`
  applied only under `/dashboard`:
  - `default-src 'self'`; `script-src 'self'`; `style-src 'self'`;
    `font-src 'self'`; `connect-src 'self'`;
  - `img-src 'self' data:` + the origin of `S3_PUBLIC_BASE_URL` if set,
    else `https://<S3_BUCKET>.s3.<S3_REGION>.amazonaws.com` if a bucket is
    set, + the origin of `PUBLIC_URL`, + each of `IMAGE_ORIGINS`;
  - `object-src 'none'`; `base-uri 'self'`; `frame-ancestors 'none'`;
    `form-action 'self'`;
  - `upgrade-insecure-requests`: **only when `settings.production`**.
  - The other helmet headers stay at their defaults. The API (`/api/v1`,
    `/fuelbot`) keeps helmet's default CSP.
- **Static:** `express.static(dashboardDir, { index: false, fallthrough: true, setHeaders })`:
  - `assets/*`: `Cache-Control: public, max-age=31536000, immutable`;
  - everything else: `Cache-Control: no-cache`.
- **SPA fallback:** `GET`/`HEAD` under `/dashboard` that isn't a static
  file and isn't under `/dashboard/assets/` → `index.html`
  (`Cache-Control: no-cache`).
  - Any other method → 404 `{error: 'not_found'}`.
  - A missing asset under `/dashboard/assets/` → 404 (no HTML for a
    script URL).
  - `/dashboard` (no slash) → 301 `/dashboard/`.
- **Not built:** if `<dashboardDir>/index.html` doesn't exist, every GET
  under `/dashboard` → **503**, `Content-Type: text/html`, a static body:
  "Dashboard not built. Run `npm ci && npm run build` in `webdashboard/`."
  (no user input in it). Logged once at boot as
  `[dashboard] not built: <dir>`. That's a path only: no secrets, no query.
- **No change** to `/api/v1`, `/fuelbot` or `/healthz`.

## Acceptance criteria

Tests use a temp `DASHBOARD_DIR` with `index.html`, `theme-boot.js` and
`assets/app-abc123.js`.

- [ ] `dashboard.test.js` › "serves index.html with the dashboard CSP":
      - `GET /dashboard/` → 200 HTML;
      - `content-security-policy` contains `script-src 'self'`,
        `style-src 'self'`, `frame-ancestors 'none'`, and **not**
        `unsafe-inline`;
      - `cache-control: no-cache`.
- [ ] `dashboard.test.js` › "hashed assets are immutable":
      `GET /dashboard/assets/app-abc123.js` → 200 JS with
      `max-age=31536000, immutable`.
- [ ] `dashboard.test.js` › "deep links fall back to index.html":
      `/dashboard/t/powerfuel/machines/DEV00001/stock` → 200 index.html;
      `/dashboard/assets/missing.js` → 404; `POST /dashboard/x` → 404.
- [ ] `dashboard.test.js` › "img-src follows the storage settings": with
      `S3_PUBLIC_BASE_URL=https://cdn.example.com/x` and
      `IMAGE_ORIGINS=https://img.example.org`, `img-src` has both origins
      and `PUBLIC_URL`'s origin; an invalid `IMAGE_ORIGINS` entry makes
      `loadSettings` throw.
- [ ] `dashboard.test.js` › "upgrade-insecure-requests only in
      production".
- [ ] `dashboard.test.js` › "not built → 503 page": an empty dir → 503
      HTML containing "npm run build".
- [ ] `dashboard.test.js` › "API CSP unchanged, / redirects": `/healthz`
      still has helmet's default CSP; `GET /` → 302 `/dashboard/`;
      `/dashboard` → 301.
- [ ] `cd server && npm test` passes. By hand: `npm start` with no build
      shows the 503 page. Record that it was seen in the commit message.

## Out of scope

Building the dashboard from the server (a deploy concern, DP §10.2),
compression (a reverse proxy's job at deploy), and CSP reporting endpoints.
