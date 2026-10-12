# FuelBot server

Backend for the FuelBot fleet: the kiosk API (`/fuelbot/config`, `/telemetry`,
`/sales`), the admin API (`/api/v1`) and the web dashboard (`/dashboard/`).
Node.js + Express + MongoDB (Mongoose).

- Plan and API contract: [devdocs/plans/server-plan.md](devdocs/plans/server-plan.md)
- Rules for changing it: [CLAUDE.md](CLAUDE.md)

## Run it locally

Needs Node.js 22 or later. MongoDB doesn't need installing: `npm run db`
downloads and runs a local `mongod` (data in `.data/`).

```sh
cd server
npm install
cp .env.example .env     # optional: every value has a dev default
npm run db               # terminal 1: MongoDB on 127.0.0.1:27017
npm start                # terminal 2: the server on http://127.0.0.1:8790
curl http://127.0.0.1:8790/healthz
```

`npm run dev` restarts on file changes.

The npm scripts read `.env` if present. To use another file, set `ENV_FILE`
(`ENV_FILE=.env.production npm start`); that file must exist. Values already in
the environment win over the file. All `.env*` files except `.env.example` are
gitignored.

## Data

```sh
npm run seed     # tenant "powerfuel", machine "DEV00001", the mock's six flavors
npm run import-config -- --tenant=<id> --machine=<id> [--tenant-name="…"] [--strip-image-urls] config.json
```

`import-config` takes an app config (the kiosk's schema, or a mock scenario
file without `extends`) and stores it as the tenant's products plus the
machine's menu. It refuses a config the app would reject and prints the
app's error text. Both can be re-run; they update in place.

## Dashboard users

```sh
npm run create-admin -- --email=you@fuelbot.example --name="You"   # asks for a password
```

That's the first `platform_admin` (FuelBot staff). Everyone else is created
in the admin API (`POST /api/v1/users`) with a temporary password they
change at first sign-in. Sessions last 48 hours.

## Dashboard

The web dashboard is its own project in [`../webdashboard`](../webdashboard).
Build it once, then this server serves it:

```sh
cd ../webdashboard && npm ci && npm run build   # writes webdashboard/dist
# then open http://127.0.0.1:8790/dashboard/ (or just http://127.0.0.1:8790/)
```

Without a build, `/dashboard/` answers 503 "Dashboard not built", and the
server logs `[dashboard] not built: <dir>` at boot. `DASHBOARD_DIR` points
elsewhere; `IMAGE_ORIGINS` adds image hosts to the dashboard's CSP. For
development with hot reload, use `npm run dev` in `webdashboard/` (Vite on
:5173, proxying `/api` here).

## Setting up a machine

1. Register it (tenant_admin or platform_admin):
   `POST /api/v1/tenants/<tenant>/machines {"name": "Bay 3"}`. The server
   generates its id (8 characters, e.g. `K7Q2M9XA`).
2. Give it a menu: `PUT …/machines/<id>/menu`, or copy one with
   `POST …/machines/<id>/menu/copy-from/<other id>`.
3. Issue its key (tenant_admin or platform_admin):
   `POST …/machines/<id>/keys {"label": "Bay 3"}`. The key (e.g.
   `7KQM-2XPA-9TRD-4WZC-HN3B`) is shown **once**.
4. On the machine: `tenant_id.txt` = the tenant id, `machine_id.txt` = the
   generated id, `machine_key.txt` = the key (case, spaces and dashes don't
   matter). Until step 2 it runs on its cached or bundled catalog; without a
   valid key the server refuses it (it keeps its sales until the key is fixed).

## Stock (estimated)

1. Set each product's portion size (grams per serving): `PATCH /api/v1/tenants/<t>/products/<p>`
   `{"portion_g": 32.5}` (with `If-Match: <rev>`).
2. After filling a hopper, record the level:
   `POST …/machines/<id>/stock/refills {"hopper": 1, "level_g": 2000}`.
3. `GET …/machines/<id>/stock` shows grams, portions and days left per hopper;
   `GET /api/v1/stock` lists every hopper that's low, empty or unknown.

It's an estimate (dosing is timed): weigh ten portions to calibrate
`portion_g`, and correct with `…/stock/adjustments` after weighing a hopper.

## Reports

All under `/api/v1`, scoped to the signed-in user: `GET /fleet` (machines,
status, today's sales), `GET /sales` (filters: `machine`, `flavor`,
`dispensed`, `from`, `to`), `GET /sales/summary?group=day|week|month|flavor|machine`
(weeks are ISO weeks, `2026-W39`; months `2026-09`), `GET /sales/export.csv`
(its first column, `local_time`, is in `DISPLAY_TZ`; `ts` is UTC),
`GET /orders/<order id>`. `GET /fleet` and `GET /stock` take `tenant=<id>`
(tenant users: only their own). FuelBot staff also get `GET /telemetry`,
`GET /faults` and `group=tenant`. Days, weeks and months are in
`DISPLAY_TZ` (default `Asia/Kolkata`).

To replace a key: issue a new one, update `machine_key.txt`, then revoke the
old one (`DELETE …/keys/<key id>`).

Check the kiosk API the way a machine does:

```sh
curl -H 'X-Tenant-Id: powerfuel' -H 'X-Machine-Id: DEV00001' \
     -H 'Authorization: Bearer DEVK-EYDE-VKEY-DEVK-EY01' http://127.0.0.1:8790/fuelbot/config
```

## Tests

```sh
npm test
```

Each test file gets its own in-memory MongoDB, so no database needs to be
running.
