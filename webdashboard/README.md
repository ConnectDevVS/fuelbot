# FuelBot web dashboard

The dashboard for FuelBot staff and for the companies that run FuelBot
machines: React + Vite + Ant Design (JavaScript), served by the backend at
`/dashboard/`. It uses only the backend's admin API (`/api/v1`).

- Spec: [devdocs/plans/dashboard-plan.md](devdocs/plans/dashboard-plan.md);
  stories in [devdocs/stories/dashboard/](devdocs/stories/dashboard/README.md).
- Rules for changing it: [CLAUDE.md](CLAUDE.md).

## Run it (development)

Needs Node.js 22 or later.

```sh
cd server && npm install && npm run db     # terminal 1: MongoDB
cd server && npm run seed && npm start     # terminal 2: the API on :8790
cd webdashboard && npm ci && npm run dev   # terminal 3: http://127.0.0.1:5173/dashboard/
```

Vite proxies `/api` and `/files` to `DASHBOARD_API_URL` (default
`http://127.0.0.1:8790`), so the browser sees one origin and the session
cookie works. The dev server sends no CSP; the built app is what runs under it.

## Build (what production serves)

```sh
cd webdashboard && npm run build   # dist/, never committed
# the server serves it: http://127.0.0.1:8790/dashboard/
```

The server renders `index.html` per request with a fresh CSP style nonce
(Ant Design writes its styles at runtime). Without a build, `/dashboard/`
answers 503.

## Test

```sh
npm run lint    # eslint, including the security bans
npm test        # vitest: unit tests + a build check
npm run e2e     # Playwright on the installed Chrome (from SRV-31)
```

## Fonts

`src/styles/fonts/` holds the kiosk's OFL fonts (`../assets/fonts/`),
subset once to WOFF2 with fonttools (in a throwaway venv:
`python3 -m venv v && v/bin/pip install fonttools brotli`):

```sh
U="U+0020-007E,U+00A0-00FF,U+2009,U+2013-2014,U+2018-201F,U+2022,U+2026,U+2032-2033,U+20B9,U+2190-2193,U+2212"
v/bin/pyftsubset assets/fonts/Archivo-Variable.ttf --unicodes="$U" \
  --layout-features='kern,liga,calt,tnum,lnum,case,ccmp,locl,mark,mkmk' \
  --flavor=woff2 --output-file=webdashboard/src/styles/fonts/archivo.woff2
v/bin/pyftsubset assets/fonts/JetBrainsMono-Variable.ttf --unicodes="$U" \
  --layout-features='kern,calt,zero,ccmp,locl,mark,mkmk' \
  --flavor=woff2 --output-file=webdashboard/src/styles/fonts/jetbrains-mono.woff2
```

(run from the repo root). Archivo: 77 KB with `₹`, both variable axes kept;
JetBrains Mono: 37 KB (it has no `₹`; Archivo is its fallback).

## Bundle

Baseline (SRV-30 placeholder: React, antd, the theme): 894 KB JS, **285 KB
gzip** (spike G: 346 KB for a fuller antd page). Routes load lazily from
SRV-33 on.
