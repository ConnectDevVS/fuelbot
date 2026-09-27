# server/CLAUDE.md

Rules for working on the backend. The root [CLAUDE.md](../CLAUDE.md) covers
the Godot kiosk app. Read it only when a change touches the app.

- **Source of truth:** [devdocs/plans/server-plan.md](devdocs/plans/server-plan.md).
  Its §3 is the kiosk ↔ backend API contract. A change to the wire format
  updates §3 and adds a decision-log row (§0) in the same commit.
- Work is planned as story sets in `devdocs/stories/<set>/` (README with
  decisions + `SIGNOFF.md`). One commit per story: `SRV-NN: <title>`.

## Commands (run from `server/`)

- `npm test`: all tests (node:test + supertest; every file gets its own
  in-memory MongoDB, so no database is needed).
- `npm run db`: local persistent MongoDB on 27017 (data in `.data/`).
- `npm start` / `npm run dev` (watch): the server on **:8790**. It reads
  `.env` if present (see `.env.example`).
- `npm run seed`: tenant `powerfuel`, machine `machine-042` (the mock's
  catalog, no image URLs). `npm run import-config -- --tenant= --machine= file`.
- `npm run create-admin -- --email=… [--name=…]`: a platform_admin (hidden
  password prompt, or `ADMIN_PASSWORD`).
- **The real app against this server:** start db + seed + server, then
  `tools/dev_run.sh --backend=server` from the repo root (config, telemetry and
  sales go to :8790; Razorpay stays on the mock).

## Rules

- **Plain JavaScript, ES modules, Express 5, Mongoose** (no TypeScript).
- **Every collection has a strict Mongoose schema** in `src/models/`
  (plan §4.1): `strict` + `strictQuery`, sub-documents as strict schemas.
  Ingest moves unknown or wrong-typed fields into the declared `extra`
  field. It never lets strict mode drop them, and never refuses the record.
- **Catalog validation mirrors the app's `ConfigManager.validate_config()`**
  (`src/catalog/validate.js`). Change both together; never serve a catalog
  the app would reject.
- **Ingest never costs data:** the app drops records on a 4xx other than
  408/429. Return 400 only for bodies that can never be valid; duplicates are
  200. Never return 401/403 on ingest until the app retries them (plan §3.5).
- **Never log** headers, cookies, bodies, machine keys, passwords or URLs with
  query strings. Keys and passwords are stored only as hashes.
- Settings come only from env vars (`src/settings.js`); no URLs or secrets
  in code.
- **Admin routes ask for a permission, never a role:** `guard('users:manage')`
  / `assertCan(user, 'menu:edit', {tenantId, machine})` from `auth/rbac.js`.
  Outside the caller's scope is 404, inside without the permission 403. Add a
  row to the RBAC table test (`test/audit.test.js`) for every new route.
- **Every admin write calls `audit(req, {...})`** (`services/audit.js`) with
  only the changed fields (`diff()`). It scrubs secret-named keys anyway.
- `createApp({settings})` takes its dependencies; tests build one per
  file (`test/helpers.js`).
- `server/.gdignore` keeps Godot out of `node_modules/`. Don't remove it.
- `mockserver/` stays the app's test backend. Server work never depends on it at
  runtime (tests read its JSON as contract fixtures); app stories may add scenarios.

## Gotchas

- **Check field types against what the app and bridge really send**, not the
  docs' prose: `dispense_cycle.base` is the bridge's number (`2`), not `"B2"`.
  A wrong type isn't lost (it lands in `extra`), but it's invisible to
  queries. After a schema change, grep `extra` in a real run.
- **Test sign-ins:** `makeUser()` + `signIn(app, email)` from `test/helpers.js`
  (the agent adds the CSRF header on writes). The login rate limiter lives in
  the app, which a test file shares: a test that exhausts it uses its own
  email.
- Inside a sub-router `req.path` is relative (`/me`, not `/auth/me`); use
  `req.baseUrl + req.path` when matching full paths.
- Mongoose's default connection is per process. That works because
  `node --test` runs each test file in its own process. Keep
  `startServer()`/`stop()` in `before`/`after` of the file, not per test.
- `node --test` needs a glob (`"test/*.test.js"`); a bare directory fails.
- The shell is zsh (see the root CLAUDE.md).
