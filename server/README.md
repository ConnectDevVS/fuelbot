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

## Data

```sh
npm run seed     # tenant "powerfuel", machine "machine-042", the mock's six flavors
npm run import-config -- --tenant=<id> --machine=<id> [--tenant-name="…"] [--strip-image-urls] config.json
```

`import-config` takes an app config (the kiosk's schema, or a mock scenario
file without `extends`) and stores it as the tenant's products plus the
machine's menu. It refuses a config the app would reject and prints the
app's error text. Both can be re-run; they update in place.

Check it the way a machine does:

```sh
curl -H 'X-Tenant-Id: powerfuel' -H 'X-Machine-Id: machine-042' http://127.0.0.1:8790/fuelbot/config
```

## Tests

```sh
npm test
```

Each test file gets its own in-memory MongoDB, so no database needs to be
running.
