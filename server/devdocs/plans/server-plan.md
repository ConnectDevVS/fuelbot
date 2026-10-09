# FuelBot backend — plan & specification

The backend for the FuelBot fleet: the API the kiosks call, an admin API,
and a web dashboard. This document is the **single source of truth** for
`server/`, and it **owns the kiosk ↔ backend API contract** (Section 3).
The kiosk plan ([greenfield-rewrite.md](../../../devdocs/plans/greenfield-rewrite.md))
describes how the app was built against that contract. Where the two
disagree about the wire format, this document wins and the other gets a
decision-log entry.

## 0. Status & decision log

**Status (2026-09-27).** **S0–S4, S6 and S6b done** ([kiosk-api](../stories/kiosk-api/SIGNOFF.md),
[users-rbac](../stories/users-rbac/SIGNOFF.md), [catalog-admin](../stories/catalog-admin/SIGNOFF.md),
[machine-keys](../stories/machine-keys/SIGNOFF.md), [read-apis](../stories/read-apis/SIGNOFF.md), [stock](../stories/stock/SIGNOFF.md) SIGNOFFs).
S6b: estimated stock per hopper (refills minus portions per real dose).
S6: fleet, sales (list, summary, CSV), and platform-only telemetry, fault
log and order detail. S4: typeable
machine keys, required by default; the app sends them and keeps its records
while a key is revoked. S3: tenants, products, machines (server-generated ids), menus,
bases, maintenance and unregistered machines through the admin API; a
machine configured only through it has run in the real app. S2: dashboard users,
48 h sessions, the role/permission table, the users API and the audit log.
S1:
the three kiosk endpoints serve real data, and the app sends its machine id
and keeps 401/403 records. The real app has run end to end against the
server (`tools/dev_run.sh --backend=server`).

**Next: S7, the dashboard.** It's planned in detail (2026-09-28) and
awaits product-owner review before any code. The plan is
[dashboard-plan.md](../../../webdashboard/devdocs/plans/dashboard-plan.md),
and the stories are SRV-27 to SRV-49 in
[webdashboard/devdocs/stories/dashboard/](../../../webdashboard/devdocs/stories/dashboard/README.md).

S5 (product images) is deferred. Deploy comes after the hosting decision.
Nothing is deployed. The mock (`mockserver/`) stays as the app's test
backend.

**Decision log.** Newest last. Sections are edited in place; this list is
the index.

| Date | Decision | Why | Where |
|------|----------|-----|-------|
| 2026-09-26 | **Node.js + Express, plain JavaScript** (no TypeScript) | Product owner | §2 |
| 2026-09-26 | **MongoDB** | Product owner | §2, §4.1 |
| 2026-09-26 | **Scope v1:** kiosk API, admin catalog API, S3 image upload, sales/telemetry read APIs, machine auth, web dashboard with RBAC | Product owner | §1, §6 |
| 2026-09-26 | **Hosting undecided**: runs locally; everything configured by env vars | Product owner | §2, §8 |
| 2026-09-26 | Backend lives in `server/` in this repo, with its own `devdocs/` and `CLAUDE.md`; this plan owns the API contract | One contract, no drift; each side reads only its own docs | this doc |
| 2026-09-26 | **Mongoose with a strict schema for every collection** (product owner). The catalog is validated on the raw input and on the built machine config by `catalog/validate.js` (the app's rules); ingest moves unknown/wrong-typed fields into a declared `extra` field instead of dropping them | Typed, documented collections, without losing records or serving a catalog the app rejects | §2, §3.3, §3.4, §4.1 |
| 2026-09-26 | **A tenant is a company; a tenant has many machines** (product owner) | How the business is organised | §2, §4.1 |
| 2026-09-26 | **Tenant product library + per-machine menu** (product owner): products (name, text, image, nutrition, default prices) belong to the tenant; each machine's menu picks products and sets hopper, price override, badge, sold out, enabled; bases, maintenance and location are per machine | One product edited once for every machine; hoppers and stock are physical, per machine | §3.2, §4.1, §4.4 |
| 2026-09-26 | **The machine sends `X-Tenant-Id` + `X-Machine-Id`** (product owner); the machine key belongs to the machine. App change in S1 (`user://machine_id.txt`) | The app's single "tenant id" today really names a machine (`machine-042`) | §3.1, §4.3, §6 |
| 2026-09-26 | **Platform + tenant roles** (product owner): `platform_admin` (FuelBot staff, all tenants); tenant users belong to one tenant: `tenant_admin`, `operator`, `viewer`, optionally limited to some machines | Companies manage their own people and machines | §4.7 |
| 2026-09-26 | **Users and prices** (product owner): `platform_admin` is the only FuelBot staff role in v1 (a read-only platform viewer may come later); every other user belongs to **exactly one tenant**; accounts get a **temporary password set by an admin**, changed at first login (no email in v1); **prices and offers are changed only by `tenant_admin` and `platform_admin`** | One dashboard for FuelBot staff and tenant users; prices are a business decision, not an operator's | §4.4, §4.6, §4.7 |
| 2026-09-26 | **Operational data is platform-only** (product owner): telemetry, maintenance (flag, message, faults, and switching it), errors (dispensing and image failure reasons), audit logs and fault logs are seen and used only by `platform_admin`. Tenant users see online/offline, last seen and a plain **in service / out of service** flag (no reason), and every paid sale, failed ones marked **not dispensed** (no reason) | FuelBot operates and services the machines; tenants run the business side | §4.4, §4.5, §4.7, §4.9, §4.10 |
| 2026-09-27 | **User management** (product owner): a `tenant_admin` can create and promote other `tenant_admin`s in their own tenant; users are **disabled, never deleted** (the audit log keeps who did what); dashboard sessions last **48 hours, fixed** (no sliding renewal) | Companies run their own admin team; accountability; fewer sign-ins | §4.4, §4.6, §4.12 |
| 2026-09-27 | **Machine ids are generated by the server** (product owner): 8 random characters from `A–Z` and `0–9` (e.g. `K7Q2M9XA`), made when a machine is registered, never chosen by hand and never reused. The id then goes into the machine's `machine_id.txt`. An unregistered id seen on ingest is therefore a provisioning mistake (a typo), listed for diagnosis only | No naming clashes between tenants; nothing to coordinate | §2.6, §4.1, §4.4, §9 |
| 2026-09-27 | **Machine keys: issued separately, typed by hand, required from the start** (product owner): a tenant_admin/platform_admin issues a key for a registered machine through the API; it's shown once and typed into the machine's `machine_key.txt`, so it's **typeable**: 20 characters in groups of 4 (`7KQM-2XPA-9TRD-4WZC-HN3B`) from an alphabet without look-alikes (≈ 99 bits); dashes, spaces and case are ignored. `MACHINE_AUTH` defaults to **`required`**; the dev seed issues a fixed dev key for `DEV00001` | The machine id isn't secret (dashboard, audit, sales, QR notes); a key typed by a technician must be unambiguous | §4.3, §4.12, §3.7 |
| 2026-09-27 | **S5 (product images) deferred; S6 next** (product owner). Until S5, products keep the `image_url` they were imported with and their bundled `image` | Reporting first; the S3 bucket isn't decided | §6 |
| 2026-09-27 | **Weekly and monthly sales are required in S7** (product owner): the summary gains `group=week` (ISO weeks, Monday–Sunday, key `2026-W39`) and `group=month` (key `2026-09`), both in `DISPLAY_TZ`; the dashboard's Sales page shows day / week / month | Owners review sales by week and month | §4.9, §4.10, §6 |
| 2026-09-27 | **Estimated stock per hopper** (product owner): no sensors; the server estimates what's left in each hopper from recorded refills minus a **per-product portion size** for every cycle that actually dosed. **Refills are recorded by the tenant_admin** (and platform_admin). New milestone S6b, before the dashboard | Know when to refill without new hardware; sensors can feed the same record later | §4.13, §6 |
| 2026-09-26 | **Missing identity → 401, and the app keeps records on 401/403** (app change in S1) | A machine that isn't provisioned yet must not lose sales | §3.5 |
| 2026-09-28 | **Dashboard: React + Vite, with a build step** (product owner). This replaces the previous session's "no build, no framework". JavaScript + JSX (planning decision; TypeScript is an open question, dashboard plan §10.1) | Maintainability and familiarity for a ~20-page, form-heavy app | §2.3, §4.10, §5 |
| 2026-09-28 | **Dashboard code lives in `/webdashboard`** (repo root), and **its docs in `/webdashboard/devdocs`** (product owner). The server serves the built `webdashboard/dist` at `/dashboard/`; `server/public/` is dropped | The dashboard is its own project with its own tooling | §2.3, §5 |
| 2026-09-28 | **Dashboard devices: fully responsive** (phone, tablet, desktop). **Look:** one FuelBot look (the kiosk's dark + lime) **plus a light mode**; the tenant's name and logo text in the top bar, no per-tenant themes. **Landing:** staff → Fleet, tenant users → Home (product owner) | Owners check sales and technicians record refills on phones; one product look | §4.10 |
| 2026-09-28 | **Dashboard charts:** revenue over time (day / ISO week / month) and flavor mix only. **No auto-refresh:** a Refresh button with an "Updated" time. **English only, best-effort accessibility.** **Extras:** a "Not dispensed" work list and a print-friendly sales report (product owner) | Keeps `/fleet` and `/stock` costs bounded; what owners asked for | §4.9, §4.10 |
| 2026-09-28 | **S7 server additions** (planning): `/auth/me` returns the caller's effective permissions, tenant, `display_tz` and session expiry; `/fleet` and `/stock` take `tenant=`; the sales CSV gains `local_time` (`DISPLAY_TZ`); `/dashboard` gets its own strict CSP (`script-src 'self'`, `style-src 'self'`, `img-src` from the storage settings + `IMAGE_ORIGINS`) | The UI never copies the role table; staff inside a tenant don't load the fleet; spreadsheets show local times; the Vite build runs with no inline code (spike A) | §4.4, §4.6, §4.9, §4.12 |
| 2026-09-28 | **Dashboard: light theme only for now** (product owner, revising the same day's "dark + light"): no dark mode and no theme toggle. Tokens stay in one block so a dark theme can be added later. **No separate claude.design session for S7** (product owner): the plan's wireframes plus styled mock-ups of Home, the provisioning card, the Menu editor, the Stock tab and the Sales filters are the design; the claude.design prompt stays as an option | Less to build and test (half the screenshots); the mock-ups cover the riskiest screens | §4.10 |
| 2026-09-28 | **Dashboard UI: Ant Design 6** instead of hand-written CSS, and **JavaScript** (product owner). antd's runtime styles run under the strict dashboard CSP through a **per-request style nonce**: the server renders `index.html` with a fresh nonce in a meta tag and in `style-src`, and the app stamps it on every `<style>`. Spike G: 63 violations without it, 0 with it; antd's `zeroRuntime` doesn't work with a custom theme in 6.6.5 | Ready-made accessible components (tables, forms, date-range picker, selects, drawers) for a small team; no `unsafe-inline` | §4.6, §4.10 |
| 2026-09-28 | **Tenant in dashboard URLs is safe**, as the product owner asked. The URL only names what to ask for; every `/api/v1` call is checked against the session's own tenant (another tenant → 404). S7 adds a test sweeping every `/tenants/:tid` route with another tenant's id (SRV-28) | Staff deep links need the tenant in the URL; tenant users gain nothing by editing it | §4.7 |
| 2026-09-28 | **Tenant users see who recorded a refill** (`last_refill.by`, an email), FuelBot staff emails included (product owner) | Refills are tenant operations; knowing who filled a hopper helps the owner, and it isn't platform-only data | §4.13; dashboard SRV-41 |
| 2026-10-09 | **Over-the-air updates (S9)** (product owner): the server holds signed release bundles (on its own storage; S3 left out), decides each machine's target version (pin, staged rollout: a test machine, then 10 %, then all; pause, withdraw, retry), answers the updater's `GET /fuelbot/update`, serves the release files and records its reports; a rollback or failure pauses the release; staff can force an update. Versions and updates are platform-only | Update the fleet safely without visits | §3.8–3.10, §4.14, §6; kiosk plan Milestone 9; [ota stories](../../../devdocs/stories/ota/README.md) |

## 1. Context

The kiosk (Godot 4.7, repo root) is built through Milestone 7 against a mock
backend. It already makes three backend calls, with an `X-Tenant-Id`
header:

- `GET {base_url}/config`: the catalog at boot, and again every
  `maintenance_poll_interval_sec` (120 s) for the maintenance flag.
- `POST {base_url}/telemetry`: machine events, from a durable on-disk queue.
- `POST {base_url}/sales`: one record per paid order, from the same kind of
  queue.

Flavor images are downloaded straight from S3 using the `image_url` in the
catalog. Razorpay is called from the machine itself.

The app's "tenant id" (`user://tenant_id.txt`, e.g. `machine-042`) has so
far named a single machine. In the real business a **tenant is a company
(e.g. a gym chain) with several machines**. So the machine gets its own id
next to the tenant id (§3.1).

What's missing is everything behind those calls: somewhere to keep each
company's products and each machine's menu and change them without a
release, somewhere for sales and telemetry to land, a way to tell a real
machine from anyone who knows its ids, and a screen for FuelBot staff and
for each company. The kiosk plan's open items that land here:
- the real config API with `image_url` and the S3 bucket (images SIGNOFF);
- the real sales and telemetry backends;
- prolonged-offline detection (kiosk plan §3.9 item 10: "purely a backend
  requirement");
- the data a future refund process needs (paid orders that didn't
  dispense).

## 2. Decisions locked in

1. **Stack:** Node.js ≥ 22 (dev on 24), **Express 5**, ES modules, plain
   JavaScript. **Mongoose** (ODM) with a **strict schema for every
   collection** (§4.1). The app's catalog rules (§3.2) stay in one
   hand-written module, `catalog/validate.js`. Schema field validators
   don't repeat them.
2. **MongoDB.** In dev and tests it comes from `mongodb-memory-server`,
   which downloads a real `mongod` (verified on this Mac, arm64), so
   MongoDB and Docker don't need installing. `npm run db` runs it as a
   persistent local database (`server/.data/`); tests get a fresh
   in-memory one per test file.
3. **One app, two faces:** the kiosk API (`/fuelbot/*`) and the admin API
   (`/api/v1/*`) run in the same process and database. The dashboard is a
   React app built by Vite in `/webdashboard` (2026-09-28). Its built
   static files (`webdashboard/dist`, `DASHBOARD_DIR`) are served by the
   same process at `/dashboard/`, and it uses only the admin API.
4. **Configuration by environment variables** (`server/.env` in dev,
   gitignored; `.env.example` lists every key). No secrets in the repo.
5. **Tenant → machines.** A **tenant** is a company. It owns a **product
   library** and any number of **machines**. A machine belongs to exactly
   one tenant. Each machine has its own **menu** (which products, on which
   hopper, at what price), bases, maintenance flag and location. The app
   still receives **one config body per machine**, in its existing schema.
6. **Ids are strings chosen at creation** and never change. A tenant id is
   a slug (`powerfuel`). A **machine id is generated by the server** when
   the machine is registered: 8 random characters from `A–Z0–9`
   (`K7Q2M9XA`), unique across the fleet, never reused. It's copied into the
   machine's `machine_id.txt`. A product id
   is a slug unique within its tenant (`guava`), and it's what the app sees
   as the flavor `id` (sales and telemetry `flavor_id`).
7. **The mock stays.** The app's automated tests keep using `mockserver/`.
   The server's own tests pin it to the same contract (§7).
8. **`server/.gdignore`**: Godot must never scan `node_modules/`.
9. **Dependencies are few and mainstream:** `express`, `mongoose`,
   `bcryptjs`, `jsonwebtoken`, `cookie-parser`, `multer`, `image-size`,
   `@aws-sdk/client-s3`, `express-rate-limit`, `helmet`. For tests:
   `node:test`, `supertest`, `mongodb-memory-server`.

## 3. Kiosk API contract

Base URL: whatever the app's `api.base_url` is set to (`local_settings.json`,
overridable per machine). The server mounts the kiosk routes at
**`/fuelbot`**, so `base_url = https://<host>/fuelbot` and the app's
`config_path` / `telemetry_path` / `sales_path` (`/config`, `/telemetry`,
`/sales`) work unchanged.

### 3.1 Request headers (every kiosk call)

| Header | Value | Notes |
|---|---|---|
| `X-Tenant-Id` | the tenant id (`powerfuel`) | Required |
| `X-Machine-Id` | the machine id (`K7Q2M9XA`) | Required. **New:** the app sends it from S1 (§6) |
| `Authorization` | `Bearer fbk_…` | The machine key (§4.3). Sent from S4 |
| `Content-Type` | `application/json` | POSTs |
| `Accept` | `application/json` | |
| `X-App-Version` | the app's version (`1.4.0`) | From S9 (OTA-01). Stored on the machine; platform-only |
| `X-Bridge-Version`, `X-Firmware-Version` | the bridge's and the firmware's versions | From S9, when the app knows them from a bridge heartbeat |

A missing or empty `X-Tenant-Id` or `X-Machine-Id` → **401**
`machine_unidentified`. The mock answers a missing tenant with 400. On
config the app treats both as "offline"; on ingest it keeps and retries a
401 from S1 onwards (§3.5). The image GET to S3 carries **none** of these
headers (kiosk plan §3.14).

### 3.2 `GET /fuelbot/config`

**200** with the machine's config body, exactly the app's schema (kiosk plan
§3.1). The server **builds** it from the tenant, the machine and the
products on the machine's menu:

```json
{
  "version": 12,
  "tenant": {"display_name": "PowerFuel Gym", "logo_text": "PF",
             "location_label": "FUELBOT · BAY 02", "site": "PowerFuel Gym / Bay 02",
             "support_phone": "1800 419 0142"},
  "flavors": [
    {"id": "guava", "name": "Prymor Guava", "hopper": 1,
     "actual_price": 90, "offer_price": 75,
     "image_url": "https://fuelbot-assets.s3.ap-south-1.amazonaws.com/powerfuel/products/guava-20260926-3fa9c1.png",
     "image": "res://assets/images/flavors/prymor_guava.png",
     "description": "…", "volume_ml": 400,
     "nutrition": {"kcal": 210, "protein_g": 24, "carbs_g": 12, "fat_g": 2},
     "ingredients": ["…"], "allergens": ["Milk", "Soy"],
     "badge": "POPULAR", "sold_out": false, "enabled": true}
  ],
  "bases": [{"id": "water", "name": "Water", "code": "B2", "enabled": true}],
  "maintenance": {"enabled": false, "message": "", "flagged_by": null,
                  "flagged_at": null, "faults": []},
  "idle_video_url": null
}
```

Where each part comes from:

| Config field | Source |
|---|---|
| `tenant.display_name`, `tenant.logo_text` | the tenant's branding |
| `tenant.location_label`, `tenant.site` | the machine |
| `tenant.support_phone` | the machine's, else the tenant's |
| `flavors[]` | the machine's menu, **in menu order**: one entry per menu item |
| `flavors[].id`, `name`, `description`, `volume_ml`, `nutrition`, `ingredients`, `allergens`, `image_url`, `image` | the product |
| `flavors[].actual_price`, `offer_price` | the menu item's price override, else the product's defaults |
| `flavors[].hopper`, `badge`, `sold_out`, `enabled` | the menu item |
| `bases`, `maintenance`, `idle_video_url` | the machine |
| `version` | `machine.menu_version + tenant.catalog_version`. Both only go up, so the sum goes up whenever anything in this body can have changed |

- **The server never serves a config the app would reject.** Every write
  that can change a machine's config (a menu edit, or a product edit for
  **every** machine whose menu uses that product) builds the resulting
  config(s) and runs the same rules as `ConfigManager.validate_config()`:
  non-empty `flavors`; each has a non-empty `id` and `name`; `hopper` a
  whole number 1–6 (`MAX_HOPPER`), **unique among enabled flavors**;
  `actual_price` > 0; `offer_price` null or > 0; `image` or `image_url`
  present; `image_url` `https://` with a file name (`http://` only for
  `127.0.0.1`/`localhost`); `sold_out` bool; `badge` string or null;
  `nutrition` an object; `maintenance.faults` an array. Prices are whole
  rupees (ints). A product appears at most once per menu. If the app's
  rules change, this list and `server/src/catalog/validate.js` change in
  the same commit.
- Fields that were never set are left out (`image_url` absent means "use
  the bundled image"). `null` is kept where the app allows it
  (`offer_price`, `badge`, `flagged_by`, `flagged_at`, `idle_video_url`).
- **Dates are `YYYY-MM-DDTHH:MM:SSZ`, with no milliseconds.** The app's
  parser (`Fmt.iso_to_unix`) rejects `…:00.000Z`, which JavaScript's
  `toISOString()` produces, so the server strips the milliseconds.
- **409** `machine_not_configured` for a registered machine whose menu is
  still empty (just registered). The app treats it like offline.
- **404** `unknown_machine` if the machine isn't registered, or belongs to
  another tenant. **403** `machine_disabled` / `tenant_disabled`. The app
  treats any non-200 as "offline" and keeps its cached catalog, which is
  what we want.
- Every identified config call updates the machine's **last seen** (§4.5).

### 3.3 `POST /fuelbot/telemetry`

The body is one event, as `TelemetryReporter` stamps it (telemetry README
event table):

| `event_type` | Source | Fields besides the common ones |
|---|---|---|
| `dispense_cycle` | bridge / app | `order_id`, `hopper`, `base` (the `B<n>` number, e.g. `2`), `result` (`DONE`/`TIMEOUT`/`REJECTED`/`NO_RESPONSE`), `reason`, `stages: [{stage, t_offset_ms}]`, `fault`, `duration_ms`, `transaction_id`, `flavor_id`, `base_id`, `order_number` |
| `machine_fault` | bridge | `fault` (e.g. `HOMING_TIMEOUT`), `order_id` or null |
| `machine_ok` | bridge | `cleared` (the code) |
| `bridge_down` | app | `silent_sec` |
| `bridge_up` | app | `down_sec` |
| `image_download_failed` | app | `flavor_id`, `file_name`, `reason` |

Common fields: `v` (1), `event_id` (ULID), `tenant_id`, `machine_id` (from
S1), `timestamp` (UTC, `Z`), `source` (`bridge`/`app`).

**Responses:**
- **201** `{"ok": true}`: stored.
- **200** `{"ok": true, "duplicate": true}`: that `event_id` was already
  stored. It's still a success, so the app's queue moves on.
- **400** `invalid_event`: the body isn't an object, or it has no
  `event_id` or `event_type`. The app **drops** a record on a 4xx, so 400
  is only for bodies that can never become valid.
- Unknown `event_type`s are stored. Unknown or wrong-typed fields go into
  the record's `extra` field and are never dropped or refused (§4.1). The
  kiosk plan's §3.9 roadmap adds types without a server change.
- **The headers are the truth.** A different `tenant_id` / `machine_id` in
  the body is kept as `body_tenant_id` / `body_machine_id` and logged, not
  rejected.
- The event updates the machine's **health** (§4.5).

### 3.4 `POST /fuelbot/sales`

The body is one sale, as `SalesReporter` builds it:

```json
{"order_id": "01J8Z6Q4M9X3T7C2V5B8N1K4RD", "order_number": 4821,
 "transaction_id": "pay_QqR8xYz3vN2Kw1", "flavor_id": "guava", "hopper": 1,
 "base_id": "water", "actual_price": 90, "offer_price": 75, "charged_price": 75,
 "currency": "INR", "payment_method": "upi",
 "dispensing_result": "success", "dispensing_reason": "",
 "tenant_id": "powerfuel", "machine_id": "K7Q2M9XA",
 "timestamp": "2026-09-19T10:22:31Z"}
```

`dispensing_result` is one of `success` / `timeout` / `rejected` /
`no_response`. **Every record is money taken**: a non-`success` record is a
paid order that didn't dispense (a refund candidate).

**Responses:** **201** stored. **200** `duplicate: true` if that `order_id`
is already stored (the first one is kept, and a second one with different
content is logged). **400** `invalid_sale` only for a non-object or a
missing `order_id`. Unknown fields go into `extra` (§4.1). The header rule
is the same as for telemetry.

### 3.5 Status codes and what the app does with them

`ReportQueue` (`core/report_queue.gd`) today **drops** a telemetry or sales
record on any 4xx except 408 and 429, and keeps and retries it on 408, 429,
5xx or a connection error. So:

- **Identity and auth problems must never cost data.** A machine that isn't
  provisioned yet, or has a missing, revoked or mistyped key, must keep its
  records until that's fixed. From **S1** the app treats **401 and 403 as
  "keep and retry"**, and the server answers every identity or key problem
  with 401 (or 403 for a disabled tenant/machine).
- **An unregistered machine on ingest is stored, not refused**, as long as
  it sends both ids. The record is flagged (`machine_known: false`), and
  the id is listed under *Unregistered machines* in the dashboard (§4.4)
  for diagnosis (ids come only from the server, so it's a provisioning
  mistake). With `MACHINE_AUTH=required` it has
  no key and gets a 401 instead, and the app retries.
- 5xx from the server means "try later". The app retries every
  `telemetry_retry_interval_sec` / `sale_report_retry_interval_sec` (60 s).
- On config, any non-200 means "offline, use the cache". That's unchanged.

Error bodies are always `{"error": "<code>"}`, plus `details` for
validation errors.

### 3.6 Idempotency and ordering

Records can arrive late (after days offline), out of order, and more than
once (a POST that succeeded but whose reply was lost). The server keys on
`event_id` / `order_id` with unique indexes, stores the client `timestamp`
(parsed as a date) **and** its own `received_at`, and reports sort by the
client timestamp.

### 3.7 App changes this contract needs

The app is changed in two steps (kiosk rules and Definition of Done apply;
each gets a kiosk-plan decision-log entry):

- **S1:** `user://machine_id.txt` (provisioned like `tenant_id.txt`,
  gitignored); `X-Machine-Id` on backend calls (config, telemetry, sales;
  never the image GET or Razorpay); `machine_id` stamped on sale and
  telemetry records and in the Razorpay QR `notes`; **`ReportQueue` keeps
  401/403**; `dev_setup.gd --machine=` (the dev defaults become tenant
  `powerfuel`, machine `DEV00001`, the seed's fixed dev id); the machine id on the maintenance
  diagnostics panel; test isolation (`tests/test_runner.gd`).
- **S4:** `user://machine_key.txt`; `Authorization: Bearer` on the same
  backend calls only; never logged (added to `run_tests.sh`'s leak grep);
  `dev_setup.gd --machine-key=`.

### 3.8 `GET /fuelbot/update` (the updater, S9)

The machine's updater (kiosk plan Milestone 9) asks every 5 minutes. Same
headers and machine auth as config (§3.1, §4.3), plus `X-Updater-Version`.
Query: `current=<version>&os=<os version>`.

```json
{"action": "stay"}
{"action": "install", "version": "1.4.1", "attempt": 1, "force": false,
 "window": {"start": "02:00", "end": "05:00", "tz": "Asia/Kolkata"}, "max_wait_days": 7,
 "manifest_url": "/fuelbot/releases/1.4.1/manifest.json"}
```

Who gets what, the window and `force` are §4.14. 401 as for config; any
other non-200 means "try later".

### 3.9 `GET /fuelbot/releases/:version/:file`

The files of a published release (`manifest.json`, `manifest.json.sig`,
and those the manifest lists). Machine auth as above (the bundles hold no
secrets and are signed, but the app's code isn't public). `Range` requests
are supported, so a cut download resumes.

### 3.10 `POST /fuelbot/update/report`

```json
{"event_id": "<ULID>", "version": "1.4.1", "attempt": 1, "from_version": "1.4.0",
 "state": "downloaded | installed | healthy | rolled_back | failed",
 "reason": "no_idle_state | bad_signature | no_space | step os-2026-11 | …",
 "log_tail": "…(≤ 20 KB, keys masked)…", "timestamp": "2026-10-09T02:14:05Z"}
```

→ `202`. Idempotent on `event_id` (§3.6). The updater keeps unsent reports
and retries, like the app's `ReportQueue`.

## 4. Specification

### 4.1 Data model (Mongoose models, strict schemas)

**Every collection has a strict Mongoose schema** (product owner): one model
per collection in `src/models/`, `strict: true` and `strictQuery: true`,
sub-documents as their own strict schemas (`_id: false`), indexes declared
on the schema, `timestamps: true` unless noted. Nothing is stored that
isn't in a schema. Two rules keep that from conflicting with the contract:

- **The catalog is validated before Mongoose sees it, and after it's
  built.** Request bodies for products and menus are type-checked on the
  *raw* JSON (`catalog/input.js`), so Mongoose's casting (`"75"` → `75`)
  can never make bad input look valid. Then the machine configs the write
  would produce are built and checked against the app's rules
  (`catalog/validate.js`, §3.2). All catalog writes go through one module
  (`services/catalog.js`); the `Product` and `Machine` models'
  `pre('validate')` hooks call the same check as a backstop, so no code
  path can save a catalog a machine would reject.
- **Ingest never drops a field.** The telemetry and sale schemas list every
  known field (§3.3, §3.4). The ingest handler moves any **unknown** field,
  and any known field with the **wrong type**, into the record's `extra`
  (a declared `Mixed` field) instead of letting strict mode discard it or
  refusing the record. Adding a field to a schema later is a normal
  migration: move it out of `extra`.

**`Tenant`** (`tenants`): a company. `_id` is the tenant id.

| Field | Type | Notes |
|---|---|---|
| `_id` | String | slug, e.g. `powerfuel` (`X-Tenant-Id`) |
| `name` | String, required | company name (dashboard) |
| `branding` | `Branding` | `display_name`, `logo_text`, `support_phone` (Strings) |
| `catalog_version` | Number | bumped on every product change |
| `disabled` | Boolean | a disabled tenant's machines get 403 |

**`Product`** (`products`): the tenant's library. Unique on
`(tenant_id, product_id)`.

| Field | Type | Notes |
|---|---|---|
| `tenant_id` | String, required | |
| `product_id` | String, required | slug; the app's flavor `id` |
| `name` | String, required | |
| `description` | String | |
| `volume_ml` | Number | |
| `nutrition` | `Nutrition` | `kcal`, `protein_g`, `carbs_g`, `fat_g` (Numbers) |
| `ingredients`, `allergens` | [String] | |
| `image_url` | String | S3 URL (§4.8) |
| `image` | String | bundled fallback, `res://…` (optional when `image_url` is set) |
| `actual_price` | Number, required | default price, whole rupees |
| `offer_price` | Number or null | default offer |
| `archived` | Boolean | hidden from the picker; refused while on any menu |
| `portion_g` | Number | grams dosed per serving (§4.13); set by tenant_admin+ (`stock:write`); stock isn't estimated without it |
| `rev` | Number | optimistic-lock token |

**`Machine`** (`machines`). `_id` is the machine id.

| Field | Type | Notes |
|---|---|---|
| `_id` | String | generated at registration: 8 characters `A–Z0–9`, e.g. `K7Q2M9XA` (`X-Machine-Id`) |
| `tenant_id` | String, required, indexed | |
| `name` | String | internal label ("Bay 02 by the lockers") |
| `location_label`, `site` | String | shown on the kiosk header |
| `support_phone` | String | overrides the tenant's when set |
| `menu` | [`MenuItem`] | in listing order: `product_id`, `hopper`, `enabled`, `sold_out`, `badge` (String or null), `price` (`{actual_price, offer_price}` or absent = the product's defaults), `low_portions` (Number, optional: the low-stock threshold for this hopper, §4.13) |
| `bases` | [`Base`] | `id`, `name`, `code`, `enabled` |
| `maintenance` | `Maintenance` | `enabled`, `message`, `flagged_by`, `flagged_at` (Date), `faults` [`{code, description}`] |
| `idle_video_url` | String or null | |
| `menu_version` | Number | bumped on every change to this machine's config fields; optimistic-lock token |
| `disabled` | Boolean | |
| `health.faults` | Map of String → Date | active fault code → since (§4.5) |
| `health.last_event_at` | Date | client time of the newest applied health event |
| `last_seen_at`, `last_seen_ip` | Date, String | any identified kiosk request |

**`Sale`** (`sales`). Unique on `order_id`. Indexed on
`(tenant_id, ts)` and `(machine_id, ts)`.

| Field | Type |
|---|---|
| `order_id` | String, required |
| `order_number`, `hopper`, `actual_price`, `offer_price`, `charged_price` | Number (`offer_price` may be null) |
| `transaction_id`, `flavor_id`, `base_id`, `currency`, `payment_method`, `dispensing_reason` | String |
| `dispensing_result` | String (`success`/`timeout`/`rejected`/`no_response`; stored even if another value arrives) |
| `timestamp` | String: the client's value, as sent |
| `tenant_id`, `machine_id` | String: from the headers |
| `body_tenant_id`, `body_machine_id` | String: only when the body's differs |
| `ts` | Date: parsed `timestamp`, or `received_at` if missing/unparseable |
| `received_at` | Date |
| `machine_known` | Boolean: the machine was registered to that tenant when received |
| `extra` | Mixed: unknown or wrong-typed fields |

No `timestamps` (records are immutable; `received_at` is the server time).

**`TelemetryEvent`** (`telemetry`). Unique on `event_id`. Same indexes as
`Sale`, plus `(event_type, ts)`. Retention: kept indefinitely in v1. A TTL
index is an open question (§9).

| Field | Type |
|---|---|
| `event_id`, `event_type` | String, required |
| `v` | Number |
| `source` | String (`bridge`/`app`) |
| `order_id`, `transaction_id`, `flavor_id`, `base_id`, `result`, `reason`, `fault`, `cleared`, `file_name` | String (`fault` may be null) |
| `order_number`, `hopper`, `base`, `duration_ms`, `silent_sec`, `down_sec` | Number |
| `stages` | [`{stage: String, t_offset_ms: Number}`] |
| `timestamp`, `tenant_id`, `machine_id`, `body_tenant_id`, `body_machine_id`, `ts`, `received_at`, `machine_known`, `extra` | as for `Sale` |

A new `event_type` needs no schema change: its common fields fit, and its
own fields go to `extra` until they're added.

**`MachineKey`** (`machine_keys`).

| Field | Type |
|---|---|
| `machine_id`, `tenant_id` | String, required, indexed |
| `hash` | String (SHA-256 hex), required, unique |
| `prefix` | String: first 8 characters, shown in the UI |
| `label` | String |
| `created_by` | ObjectId → `User` |
| `last_used_at`, `revoked_at` | Date |

**`User`** (`users`).

| Field | Type |
|---|---|
| `email` | String, required, lowercase, trimmed, unique |
| `name` | String |
| `password_hash` | String, required, **`select: false`** (bcrypt, cost 12) |
| `role` | String, enum `platform_admin`/`tenant_admin`/`operator`/`viewer` |
| `tenant_id` | String: required for tenant roles, absent for `platform_admin` |
| `machines` | [String]: machine ids; empty = all of the tenant's machines (`operator`/`viewer` only) |
| `disabled` | Boolean |
| `token_version` | Number, default 0 |
| `must_change_password` | Boolean: set when an admin creates the user or sets their password |
| `last_login_at` | Date |

**`AuditEntry`** (`audit`). No `timestamps` (`at` is the time).

| Field | Type |
|---|---|
| `at` | Date, indexed |
| `user_id` | ObjectId → `User` |
| `user_email`, `action`, `tenant_id`, `machine_id`, `target`, `ip` | String |
| `before`, `after` | Mixed: only the changed part (e.g. the one product or menu item) |

### 4.2 Kiosk request pipeline

Identity headers (§3.1) → machine auth (§4.3) → handler → last-seen update
(best effort; never fails the request). The kiosk routes share no code with
the admin session auth.

### 4.3 Machine auth

- **Issued separately**, after registration: `POST …/machines/:mid/keys`
  (tenant_admin+) returns the key **once**; a technician types it into the
  machine's `machine_key.txt`.
- **Key format (typeable):** 20 characters from
  `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no `0 O 1 I L`), shown in groups of four:
  `7KQM-2XPA-9TRD-4WZC-HN3B` (≈ 99 bits: unguessable). When checking, dashes,
  spaces and case are ignored. The database stores only the SHA-256 of the
  normalised key and its first 4 characters (to identify it in the UI).
- **One machine, its own keys.** Sent as `Authorization: Bearer <key>` with
  both id headers. The key must belong to that machine (and so to that
  tenant) and not be revoked.
- **Modes** (`MACHINE_AUTH`):

  | Mode | No key | Wrong key, or another machine's | Right key |
  |---|---|---|---|
  | `off` | allowed | allowed (ignored) | allowed |
  | `optional` | allowed | **refused** | allowed |
  | `required` (**default**, product owner) | **refused** | **refused** | allowed |

  "Refused" is **401** `machine_key_required` (none sent) or
  `machine_key_invalid`, which the app keeps and retries (§3.5). An
  unregistered machine has no key, so under `required` its records wait on
  the machine instead of being stored as unregistered.
- A machine can have several active keys (rotation: issue new, update the
  machine, revoke old). `last_used_at` is updated at most once a minute
  per key.
- **On the machine:** `user://machine_key.txt`, never logged, sent on
  backend calls only (§3.7).

### 4.4 Admin API (`/api/v1`)

JSON in and out. Session cookie auth (§4.6). Every request is checked
against RBAC (§4.7) and every write is audited. List endpoints take `limit`
(≤ 200, default 50) and `cursor` (opaque), and return `{items,
next_cursor}`. Tenant resources are nested under `/tenants/:tid`, so the
tenant check happens once per request.

**Auth & users**

| Method & path | Who | What |
|---|---|---|
| `POST /auth/login` | anyone | `{email, password}` → sets the session cookie, returns `{user}` (the dashboard calls `/auth/me` next). Rate-limited |
| `POST /auth/logout` | signed in | clears the cookie |
| `GET /auth/me` | signed in (also while a password change is required) | `{user, permissions, all_machines, tenant, display_tz, session_expires_at}` (SRV-28): `permissions` is the effective set from `auth/rbac.js` `effectivePermissions()` (the role's set, minus `products:edit` for a user limited to some machines), sorted; `tenant` is `{id, name, logo_text}`, null for platform; `session_expires_at` is ISO UTC without milliseconds |
| `POST /auth/password` | signed in | `{current, new}`; bumps `token_version` (other sessions end); answers like `/auth/me`, with the new session's expiry |
| `GET /users` · `POST /users` | platform_admin (any tenant), tenant_admin (own tenant) | list / create (`{email, name, role, tenant_id, machines, password}`). A tenant_admin can't create a `platform_admin` or users of another tenant |
| `PATCH /users/:id` | same | role, machines, name, `disabled` (disabling ends sessions). **No deletion**: a disabled user can be re-enabled |
| `POST /users/:id/password` | same | set a new temporary password (ends sessions) |

**User rules** (enforced on every create/update):
- A `tenant_admin` manages the users of **their own tenant**, including other
  `tenant_admin`s; never a `platform_admin` or another tenant's users.
- Nobody changes their **own** role or disables themselves (403
  `forbidden_self`).
- A tenant that has an active `tenant_admin` always keeps at least one (409
  `last_tenant_admin`), and there's always at least one active
  `platform_admin` (409 `last_platform_admin`).
- `tenant_id` never changes. `machines` applies to `operator`/`viewer` only
  and must name machines of that tenant.
- A role change, disabling, or a password set by an admin bumps
  `token_version`, which ends that user's sessions at once.

**Accounts get a temporary password.** A `platform_admin` or `tenant_admin`
creates the user with a temporary password and passes it on outside the
system. It sets `must_change_password`; until the user changes it
(`POST /auth/password`), every other `/api/v1` call returns **403**
`password_change_required`, and the dashboard shows only the change-password
form. An admin's `POST /users/:id/password` works the same way (a reset).
There's no email in v1 (§8).

The first `platform_admin` comes from `npm run create-admin` (asks for the
email and password on the terminal). There's no self sign-up.

**Tenants**

| Method & path | Who | What |
|---|---|---|
| `GET /tenants` | signed in | platform: all; others: their own |
| `POST /tenants` | platform_admin | `{id, name, branding}` |
| `GET /tenants/:tid` | members | the tenant, machine count, `catalog_version` |
| `PATCH /tenants/:tid` | tenant_admin+ | `name`, `branding`; `disabled` (platform_admin only) |

**Products** (the tenant's library)

| Method & path | Who | What |
|---|---|---|
| `GET /tenants/:tid/products` | members | all products (`?archived=true` to include archived), with the machines each is on |
| `POST /tenants/:tid/products` | tenant_admin+ | create (a new product always sets a price) |
| `GET /tenants/:tid/products/:pid` | members | one product |
| `PATCH /tenants/:tid/products/:pid` | operator+ (all machines); **`actual_price`/`offer_price`: tenant_admin+** | change fields, `archived`. `If-Match: <rev>` |
| `POST /tenants/:tid/products/:pid/image` · `DELETE …/image` | operator+ (all machines) | §4.8 |

A product write is validated against **every machine whose menu uses it**
(§3.2). A refusal is **422** `invalid_config`, with the machine ids and the
app's error strings. It bumps `rev` and the tenant's `catalog_version`.

**Machines**

| Method & path | Who | What |
|---|---|---|
| `GET /tenants/:tid/machines` | members (their machines) | machines with status (§4.5: the tenant view for tenant users) |
| `POST /tenants/:tid/machines` | tenant_admin+ | register `{name, location_label, site}`: the server **generates the id** and returns it (to copy into the machine's `machine_id.txt`); starts with an empty menu and the default base (water) |
| `GET /tenants/:tid/machines/:mid` | members | the machine, status, `menu_version` (tenant users: no `maintenance`, no `health`) |
| `PATCH /tenants/:tid/machines/:mid` | tenant_admin+ | `name`, `location_label`, `site`, `support_phone`, `idle_video_url`, `disabled` |
| `GET /tenants/:tid/machines/:mid/config` | members | **exactly what the machine gets** (preview); for tenant users without the `maintenance` block |
| `PUT /tenants/:tid/machines/:mid/menu` | operator+; **a changed `price`: tenant_admin+** | the whole menu, in order: `[{product_id, hopper, enabled, sold_out, badge, price}]` |
| `PATCH /tenants/:tid/machines/:mid/menu/:pid` | operator+; **`price`: tenant_admin+** | one item (price, sold out, enabled, hopper, badge) |
| `PUT /tenants/:tid/machines/:mid/bases` | tenant_admin+ | the bases list |
| `PUT /tenants/:tid/machines/:mid/maintenance` | **platform_admin** | `{enabled, message, faults}`; the server sets `flagged_by` (the user) and `flagged_at` (now) when it's switched on |
| `POST /tenants/:tid/machines/:mid/menu/copy-from/:src` | operator+ (both machines) | copy another machine's menu (same tenant) |
| `GET /unregistered` | **platform_admin** | machine ids seen on ingest but not registered, per tenant id (first/last seen, record counts) |

- Machine writes (`/menu`, `/bases`, `/maintenance`, and the fields that
  feed the config) carry `If-Match: <menu_version>`. A stale version →
  **409** `version_conflict` with the current version, and the dashboard
  reloads. Each is validated (§3.2) on the resulting config and bumps
  `menu_version`.
- *Unregistered* ids can't be claimed: ids come only from the server, so an
  unknown id is a typo or a wrong tenant in the machine's files. Fix the
  files; the records already stored stay flagged `machine_known: false`.
- **When changes reach the machine:** the maintenance flag within one poll
  (≤ 120 s). **Menu and product changes (prices, images, sold out) at the
  machine's next restart**: the app reads the catalog at boot, and later
  polls apply only the maintenance part. The dashboard says so next to
  Save.

**Machine keys**

| Method & path | Who | What |
|---|---|---|
| `GET /tenants/:tid/machines/:mid/keys` | tenant_admin+ | keys (prefix, label, created, last used, revoked) |
| `POST /tenants/:tid/machines/:mid/keys` | tenant_admin+ | `{label}` → returns the **full key once** |
| `DELETE /tenants/:tid/machines/:mid/keys/:kid` | tenant_admin+ | revoke |

**Reports:** §4.9. **Audit:** `GET /audit` (**platform_admin** only;
filter by tenant, machine, user, action, date). Every write is audited,
including tenant users' writes; tenants just can't read the log.

### 4.5 Machine status (derived)

Per machine, computed on read:
- **online**: `last_seen_at` within `OFFLINE_AFTER_SEC` (default 300 s, a
  bit over two maintenance polls).
- **faults**: from telemetry on ingest. `machine_fault` adds `fault`;
  `machine_ok` removes `cleared`; `bridge_down` adds `BRIDGE_DOWN`;
  `bridge_up` removes it. Events are applied in client-timestamp order: an
  older event arriving late doesn't overwrite a newer state.
- **maintenance**: the machine's remote flag. The machine's local faults
  above also put it out of service by themselves (kiosk plan §3.10).
- **today**: the day's sales count and revenue, failed dispenses, and last
  sale time.

**Two views of the same status:**

| | `platform_admin` | tenant users |
|---|---|---|
| status | `ok` / `maintenance` / `fault` / `offline` (worst wins: offline > fault > maintenance > ok) | `online` + `in_service` (false when in maintenance or faulted) |
| last seen | yes | yes |
| fault codes and since | yes | **no** |
| maintenance flag, message, faults | yes | **no** |
| today | count, revenue, failed dispenses, last sale | count, revenue, not dispensed, last sale |

There are no alerts in v1 (§8), but lists sort by status.

### 4.6 Dashboard sessions

- Email + password. bcrypt (`bcryptjs`, cost 12). Passwords are at least 10
  characters.
- The session is a JWT (HS256, `JWT_SECRET`) holding `{sub, tv}` (user id,
  `token_version`) in an **httpOnly, `SameSite=Strict`** cookie `fb_session`
  (`Secure` in production), valid for `SESSION_HOURS` (**48, fixed**: no
  renewal while active; sign in again after 48 h). Each request
  loads the user. A disabled user or a changed `token_version` → 401.
- **CSRF:** `SameSite=Strict`, plus every non-GET `/api/v1` request must
  send `X-Requested-With: fuelbot-dashboard` (a cross-site form can't set
  it).
- **Login rate limit:** `LOGIN_RATE_LIMIT` (10) attempts per 15 minutes per
  IP + email. The error doesn't say whether the email exists.
- `JWT_SECRET` is **required** when `NODE_ENV=production`. In dev a random
  one is made per process, and sessions end on restart.
- `helmet` headers. The API keeps helmet's default CSP. `/dashboard` has
  its own strict CSP (S7, SRV-29):
  - `script-src 'self'`; `style-src 'self' 'nonce-<per request>'`. Ant
    Design writes its styles at runtime, so the server renders
    `index.html` per request with a fresh nonce. There's no `unsafe-inline`;
  - `img-src 'self' data:` + the storage origins + `IMAGE_ORIGINS`;
  - `frame-ancestors 'none'`;
  - `upgrade-insecure-requests` in production only.
  - `index.html` is `Cache-Control: no-store` (the nonce); hashed
    `assets/*` are `max-age=31536000, immutable`; other GETs under
    `/dashboard` fall back to `index.html` (deep links); no build → 503.
    `GET /` → `/dashboard/`. Built in SRV-29 (`src/dashboard.js`).
  - The details are in the
    [dashboard plan §2.4](../../../webdashboard/devdocs/plans/dashboard-plan.md).

### 4.7 Roles (RBAC)

| Role | Scope | Can |
|---|---|---|
| `platform_admin` | all tenants | everything: tenants, any user, `/unregistered`, **telemetry, maintenance, errors, audit and fault logs**, and all of below in any tenant |
| `tenant_admin` | their tenant, all machines | their tenant's users (not platform ones), branding, machines (register, edit, bases, disable), machine keys, products, menus, **prices and offers**, images, sales, **stock: refills, adjustments, portion sizes** |
| `operator` | their tenant; all machines, or the listed `machines` | menus (hopper, sold out, enabled, badge, order) of their machines; **edit existing products' text and images only if they have all machines** (a product change reaches every machine); never create products; **never prices or offers** (product defaults or menu overrides); sales and stock (read) for their machines |
| `viewer` | same as operator | read only: products, menus, tenant status, sales and stock of their machines |

- **`platform_admin` can do everything a `tenant_admin` can, in every
  tenant** (product owner, 2026-09-27): users, branding, machines, keys,
  products, menus, prices, stock refills and adjustments, sales, plus the
  platform-only data below. In code the platform set is built from the
  tenant_admin set, and a test fails if they ever diverge.
- **Platform-only data** (product owner): **telemetry** (every event),
  **maintenance** (the flag, message and faults, and switching it),
  **errors** (`dispensing_result` and `dispensing_reason` values, image
  download failures, any other failure reason), **audit logs** and **fault
  logs** (machine health, fault events). Tenant users get none of it, in
  any response.
- **Tenant responses are built from an allowlist**, never by deleting
  fields from the platform response: one view module
  (`services/views.js`) per resource has a `platform` and a `tenant`
  projection. The database query itself selects only the tenant fields
  (Mongoose `select`), so a new field is hidden from tenants until it's
  added to their projection. A test checks that no tenant response
  contains `maintenance`, `health`, `fault`, `dispensing_reason` or a
  telemetry field.
- **Prices** (`actual_price`, `offer_price` on a product, `price` on a menu
  item) are a separate permission, `price:write`: `tenant_admin` and
  `platform_admin` only. A request from an operator that *changes* a price
  is refused with **403** `forbidden_field` (the whole request, nothing
  saved). Sending the unchanged value is fine, so the dashboard can send
  whole objects.
- **One tenant per user.** Every user except `platform_admin` has exactly
  one `tenant_id`, which never changes. Someone working for two companies
  gets two accounts.
- **Extensible:** roles map to permission sets in one table in
  `auth/rbac.js`, so a later `platform_viewer` (FuelBot staff, read-only
  across tenants) is one new row.

Enforced in the API by one module (`auth/rbac.js`):
`can(user, action, {tenantId, machineId})`. A tenant or machine the user
can't see returns **404**, not 403 (no probing). Reports are filtered to
the user's machines in the query itself, never after the fact. The
dashboard only hides what a role can't use. Hiding is never the
protection.

### 4.8 Product images (upload → S3 → `image_url`)

`POST /api/v1/tenants/:tid/products/:pid/image`, multipart, field `image`.

1. **Checks (the app's limits):** ≤ **2 MB**; type by **signature**, not
   extension or MIME (PNG, JPEG, WebP); dimensions via `image-size`, ≤
   **2048 px** on either side, > 0. A refusal is **422** with the same
   reason words the app uses (`too_large_bytes`, `too_large_px`,
   `not_an_image`, `empty_image`). A warning (not a refusal) for JPEG (no
   transparency) or not portrait.
2. **Name:** `<product id>-<yyyymmdd>-<6 random hex>.<ext>`, so it's
   **always a new name** (the kiosk caches by file name; image spec). The
   key is `<S3_PREFIX>/<tenant>/products/<name>`.
3. **Store:**
   - `STORAGE=s3`: `PutObject` with the right `Content-Type` and
     `Cache-Control: public, max-age=31536000, immutable` (the name never
     gets reused). URL = `S3_PUBLIC_BASE_URL/<key>`, or the bucket's
     virtual-host URL. Credentials come from the standard AWS SDK chain,
     never from the repo. The bucket must allow public read of these
     objects, or sit behind CloudFront (§9).
   - `STORAGE=local` (dev): written under `LOCAL_STORAGE_DIR` and served at
     `/files/…`. The URL is `PUBLIC_URL/files/…`, `http://127.0.0.1…`, which
     the app accepts only because it's localhost.
4. Set the product's `image_url`, bump `rev` and `catalog_version`, audit.
   Every machine with the product on its menu gets the new image at its
   next restart. The old object is **never deleted** (image spec: machines
   may still be showing it).

Remove an image: `DELETE …/image` clears `image_url` (machines fall back to
the bundled `image`). It's refused if the product has no bundled `image`
and is on a menu (§3.2).

### 4.9 Read APIs

All are scoped to what the user can see (§4.7). Filters: `tenant`
(platform only), `machine`. Dates are ISO; days are grouped in
`DISPLAY_TZ` (default `Asia/Kolkata`).

| Method & path | Who | Returns |
|---|---|---|
| `GET /fleet` | all | visible machines with status (§4.5, per view), grouped by tenant for platform. `tenant=` filter (SRV-27): platform any tenant (an unknown one gives empty `items` and `tenants`); tenant users only their own, else 404 |
| `GET /sales` | all | filters: `tenant`, `machine`, `from`, `to`, `flavor`, `dispensed`; platform also `result`. Newest first |
| `GET /sales/summary` | all | `group=day\|week\|month\|flavor\|machine\|tenant`: count, revenue (`sum charged_price`), not-dispensed count and amount. `week` = ISO week (Monday–Sunday) keyed `2026-W39`, `month` keyed `2026-09`, both in `DISPLAY_TZ`, sorted ascending like `day` (SRV-27) |
| `GET /sales/export.csv` | all | the `/sales` filters as CSV (streamed), same columns as the caller's view, with a first column `local_time` (`YYYY-MM-DD HH:MM:SS` in `DISPLAY_TZ`, SRV-27) before `ts` (UTC) |
| `GET /telemetry` | **platform_admin** | filters: `tenant`, `machine`, `type`, `from`, `to`, `order_id` |
| `GET /faults` | **platform_admin** | fault log: `machine_fault` / `machine_ok` / `bridge_down` / `bridge_up` as open/closed intervals per machine |
| `GET /orders/:order_id` | all | the sale; for platform also every telemetry event for that order (joined on `order_id`) |

**A tenant user's sale** has `dispensed` (true when `dispensing_result`
is `success`, otherwise false, shown as **Not dispensed**) instead of
`dispensing_result` / `dispensing_reason`. Platform users see both raw
fields.

Revenue counts every sale record: money was taken whatever the dispense
outcome. Refunds aren't modelled (§8), so the summary shows not-dispensed
sales next to revenue rather than subtracting them.

### 4.10 Dashboard (`/dashboard/`)

**Specified in its own document:**
[webdashboard/devdocs/plans/dashboard-plan.md](../../../webdashboard/devdocs/plans/dashboard-plan.md).
It covers the design brief, the page-by-page spec, the permission → UI map,
the error messages, the wireframes, the spikes and the risks. The stories
are
[webdashboard/devdocs/stories/dashboard/](../../../webdashboard/devdocs/stories/dashboard/README.md)
(SRV-27 to SRV-49). In short (product-owner decisions of 2026-09-28 in §0):

- **Stack and serving:**
  - a React + Vite app in `/webdashboard`, JavaScript, UI components from
    **Ant Design 6** themed for FuelBot;
  - `npm run build` → `webdashboard/dist`, served by this server at
    `/dashboard/` with its own strict CSP (§4.6), an SPA fallback, and
    long-cache hashed assets;
  - it uses only `/api/v1`, same origin, with the session cookie and the
    CSRF header.
- **Two audiences, one UI:**
  - staff land on **Fleet** (all tenants, problems first) and get a
    tenant switcher plus Platform pages (Tenants, Faults, Telemetry,
    Audit, Unregistered, all users, all sales);
  - tenant users land on **Home** (today's KPIs, revenue and flavor-mix
    charts, machines, refill soon).
  - Both share Sales, Stock, Machines (with tabs: Menu, Config preview,
    Stock, Sales, Settings, Bases, Keys; staff also Maintenance,
    Telemetry, Faults), Products, Users and Company.
- **Role-aware from `/auth/me` permissions:** controls a role can't use
  aren't shown, and operators see prices read-only. The server still
  enforces everything; tenant screens show no platform-only data (§4.7),
  and a failed sale is "Not dispensed".
- **Fully responsive** (phone, tablet, desktop); the FuelBot look in a
  light theme (no dark mode for now); English; no auto-refresh (a Refresh button).
- **Sales** by day / ISO week / month (§4.9), by flavor and machine, CSV,
  a Not-dispensed work list, and a printable report.
- **Provisioning card:** tenant id, machine id and the once-shown key in a
  typeable, copyable, printable form.
- **Notes next to Save:** "reaches the machine at its next restart";
  maintenance "within about 2 minutes".
- **Not in S7:** image upload (S5), alerts, refunds, per-tenant themes,
  i18n.

### 4.11 Logging & secrets

- A request log line is method, path (no query), status and time. **Never**
  headers, cookies, bodies, machine keys, passwords, or image URLs with
  query strings.
- Secrets exist only in env vars: `JWT_SECRET` and the AWS credentials.
  Machine keys and passwords exist only as hashes. A test greps the logs of
  a full test run for the issued keys and passwords (same spirit as the
  kiosk's credential-leak check).

### 4.12 Settings (env)

`PORT` (8790), `HOST` (127.0.0.1), `PUBLIC_URL`, `MONGO_URL`
(`mongodb://127.0.0.1:27017/fuelbot`), `NODE_ENV`, `JWT_SECRET`,
`SESSION_HOURS` (48), `COOKIE_SECURE`, `LOGIN_RATE_LIMIT` (10),
`MACHINE_AUTH` (`required`), `STOCK_LOW_PORTIONS` (15), `OFFLINE_AFTER_SEC` (300), `DISPLAY_TZ`
(`Asia/Kolkata`), `STORAGE` (`local`), `LOCAL_STORAGE_DIR`, `S3_BUCKET`,
`S3_REGION` (`ap-south-1`), `S3_PREFIX`, `S3_PUBLIC_BASE_URL`,
`LOG_REQUESTS` (true).

S7 adds (SRV-29):
- `DASHBOARD_DIR` (default `<repo>/webdashboard/dist`);
- `IMAGE_ORIGINS` (a comma list of extra `https://` image origins for the
  dashboard CSP; anything that isn't a bare https origin stops the server
  at boot).

Ports in use locally:
- 8787: the mock;
- 8788: the test mock;
- **8790: the server**;
- S7: 5173 for the dashboard's Vite dev server, and 8795 for the
  dashboard's browser-test server.

### 4.13 Estimated stock (no sensors)

*(Decided 2026-09-27, product owner; milestone S6b.)* The machines have no
level sensors. The server estimates what's left in each hopper from two
facts it can trust: **what went in** (refills recorded by a tenant_admin)
and **what came out** (every dispense cycle that actually dosed that
hopper). It's an estimate: dosing is timed, so real grams per portion drift
with powder density, humidity and auger wear. Calibrate the portion size
by weighing ten portions.

**Inputs**
- **Portion size per product:** `Product.portion_g` (grams per serving;
  it varies by product). Set by tenant_admin+ (`stock:write`). Without it,
  that product's stock shows as "not estimated".
- **Refills:** a tenant_admin (or platform_admin) records "hopper 3 filled
  to 2000 g" on the machine's Stock page after filling it. A refill states
  the **level after filling** (not "grams added"), so a missed dose or a
  wrong estimate is corrected at every refill. An **adjustment** (same
  shape) corrects the level without a refill, e.g. after weighing.
- **Doses:** every `dispense_cycle` for that machine and hopper whose
  `stages` contain `PROTEIN_DISPENSED`. Counting the stage, not the sale,
  means a cycle that failed before dosing doesn't count, and one that dosed
  and then timed out does. Rejected orders never dose.

**Model:** `StockEvent` (`stock_events`), strict: `tenant_id`,
`machine_id`, `hopper`, `product_id`, `kind` (`refill` / `adjust`),
`level_g`, `note`, `user_id`, `user_email`, `at`. Every entry is also
audited.

**Estimate** (computed on read, per machine and hopper):

```
since   = the latest refill/adjust for this machine + hopper
doses   = dispense_cycle events for this machine + hopper with PROTEIN_DISPENSED, ts > since.at
left_g  = max(since.level_g − doses × product.portion_g, 0)
portions_left = floor(left_g / portion_g)
rate    = doses per day over the last 7 days (this hopper)
days_left = portions_left / rate   (null when there were no doses)
```

- **Low** when `portions_left` ≤ the menu item's `low_portions` (default
  `STOCK_LOW_PORTIONS`, 15). **Empty** at 0.
- **The product in the hopper** is the one the refill named. If the menu
  puts a different product on that hopper afterwards, the estimate shows
  **"refill needed"** until a refill names the new product (the old powder
  is still physically there, and the server can't know how much).
- **Nothing is automatic in v1:** an empty estimate doesn't mark the
  flavor sold out (it's an estimate). The dashboard shows low and empty, and
  a person decides (open question §9.7).
- **Machines without a refill yet** show "unknown" per hopper.
- **Clocks:** a refill is stamped with server time, a dose with the
  machine's clock (`ts`, client time like every report). A machine clock
  that's off shifts which doses fall before or after a refill, a small error
  for an estimate. The Pi keeps time over NTP (check at deploy).

**API** (under `/api/v1/tenants/:tid/machines/:mid`)

| Method & path | Who | What |
|---|---|---|
| `GET …/stock` | members (their machines) | per hopper on the menu: product, `portion_g`, last refill (level, when, by whom), doses since, `left_g`, `portions_left`, `days_left`, `low`, `empty`, `state` (`ok` / `low` / `empty` / `unknown` / `refill_needed` / `not_estimated`) |
| `POST …/stock/refills` | tenant_admin+ (`stock:write`) | `{hopper, level_g, note?}`: the product is the one on that hopper now |
| `POST …/stock/adjustments` | tenant_admin+ | same shape, `kind: adjust` |
| `GET …/stock/history` | members | refills and adjustments, newest first (cursor pages) |

Plus `GET /api/v1/stock?state=low,empty` (scoped): every visible hopper
that needs attention across the fleet, for the "refill soon" list, with a
`tenant=` filter (SRV-27) under the same rule as `/fleet`.
`portion_g` is set through the product (`PATCH …/products/:pid`) and
`low_portions` through the menu item.

**Roles:** reading stock follows machine visibility (all tenant roles, for
their machines). `stock:write` (refills, adjustments, `portion_g`,
`low_portions`) is tenant_admin and platform_admin.

**Later, with sensors** (kiosk plan §3.9 item 4): a measured level from a
`hopper_levels` telemetry event becomes an automatic `adjust` entry, so
machines with sensors are measured and the rest stay estimated, in the
same record and API.

### 4.14 Releases and rollouts (S9)

Built in [OTA-05](../../../devdocs/stories/ota/OTA-05-server.md), which has
the full rules. In short:

- **Models:** `Release` (version, manifest, files, notes, status `draft |
  rolling | paused | done | withdrawn`, stages, current stage) and
  `UpdateEvent` (one per report, §3.10); the machine gains `software`
  (app, bridge, firmware, OS versions; pin; window; last update).
- **Upload** verifies the bundle's Ed25519 signature
  (`RELEASE_PUBLIC_KEY`) and every file's sha256, as the machine will;
  files go to `RELEASES_DIR`.
- **Target for a machine:** its pin, else the newest `rolling`/`done`,
  not withdrawn release whose stages so far include it (stage 0 = named
  test machines; a percent stage includes a machine when
  `hash(machine_id + version) mod 100 < percent`); a paused release reaches
  no new machines; a machine on a withdrawn version goes to the newest
  release that includes it; `min_from_version` first when needed.
- **Window and force:** the machine's own window, else `UPDATE_WINDOW`
  (`02:00-05:00` in `DISPLAY_TZ`); `UPDATE_MAX_WAIT_DAYS` (7); staff's
  "Update now" (one machine) or "Install now" (a release's current stage)
  sets `force` until the machine reports `healthy` or `failed`.
- **Auto-pause:** a `rolled_back`, or a `failed` other than `no_space`,
  pauses the release (audited).
- **Admin API** (platform only: `releases:manage` to act, `telemetry:read`
  to see): releases (upload, publish, promote, pause, resume, withdraw,
  install-now, retry) and a machine's software (view, pin, window, update
  now). Every action audited. `/fleet` gains a `software` block for staff.
- **Settings:** `RELEASES_DIR`, `RELEASE_PUBLIC_KEY`, `RELEASE_MAX_MB`
  (200), `UPDATE_WINDOW`, `UPDATE_MAX_WAIT_DAYS`.

## 5. Target folder structure

```
server/
├── CLAUDE.md                 server-only rules, commands, gotchas
├── README.md                 how to run it
├── .env.example  .gitignore  .gdignore  package.json
├── devdocs/
│   ├── plans/server-plan.md  this document
│   └── stories/<set>/        SRV story sets: README (decisions) + SIGNOFF
├── src/
│   ├── index.js              entry: settings → db → app → listen
│   ├── app.js                createApp({settings, storage}): middleware, routes, errors
│   ├── dashboard.js          /dashboard: webdashboard/dist, its CSP + style nonce, SPA fallback
│   ├── settings.js           env → settings
│   ├── db.js                 mongoose connect / disconnect, syncIndexes
│   ├── models/               Tenant, Product, Machine, Sale, TelemetryEvent, MachineKey,
│   │                         User, AuditEntry, StockEvent (strict schemas, §4.1, §4.13)
│   ├── catalog/              input.js (raw-body checks), build.js (tenant + machine + products
│   │                         → config body), validate.js (= the app's rules)
│   ├── auth/                 machine.js (ids + keys), session.js (JWT cookie), rbac.js, passwords.js
│   ├── routes/               kiosk.js, auth.js, users.js, tenants.js, products.js, machines.js,
│   │                         keys.js, reports.js, audit.js
│   ├── services/             catalog.js (every catalog write), health.js (status), audit.js,
│   │                         views.js (platform / tenant projections, §4.7), stock.js (§4.13)
│   └── storage/              index.js, local.js, s3.js
├── scripts/                  db.js (local mongod), seed.js, create-admin.js, import-config.js
└── test/                     helpers.js + *.test.js (node:test, supertest, in-memory MongoDB)

webdashboard/                 the dashboard (S7, 2026-09-28): React + Vite; src/, e2e/, devdocs/
                              (plan, stories, design); its build (dist/) is served at /dashboard/
```

`server/public/` from the earlier sketch is dropped: the dashboard is its
own project at the repo root.

## 6. Build order

Each milestone is one story set in `server/devdocs/stories/`, one commit per
story (`SRV-NN: <title>`). Each milestone is usable at its end.

| # | Milestone | Produces | Usable for |
|---|---|---|---|
| S0 | Scaffold | `server/`, settings, db, `/healthz`, test harness, `npm run db`, `.env.example`, `CLAUDE.md`, README | — |
| S1 | Kiosk API + machine identity | models; `catalog/` (input, build, validate); `/fuelbot/config`, `/telemetry`, `/sales` per §3; last seen and health; `npm run seed` (tenant `powerfuel`, machine `DEV00001`, products and menu from the mock's catalog) and `import-config` (an app config JSON → products + a machine menu). **App:** the S1 changes in §3.7 | the dev app pointed at the real server (override `api.base_url`) |
| S2 | Users, sessions, RBAC, audit | §4.6, §4.7, `create-admin`, audit service | — |
| S3 | Admin catalog API | tenants, products, machines, menus, bases, maintenance, copy, unregistered machines, optimistic locking | changing products and menus without editing JSON |
| S4 | Machine keys | §4.3. **App:** the S4 changes in §3.7 | `MACHINE_AUTH=required` |
| S5 | Product images (**deferred**, after S6) | §4.8, local and S3 drivers (S3 tested against a stubbed client) | the images SIGNOFF's pending "real S3" item, once a bucket exists |
| S6 | Read APIs | §4.9, fleet status | reporting without the dashboard |
| S6b | Estimated stock | §4.13: `portion_g`, `low_portions`, `StockEvent`, refills / adjustments, the estimate, stock APIs | knowing when to refill, before the dashboard shows it |
| S7 | Dashboard (**planned 2026-09-28; review pending**) | §4.10 → the [dashboard plan](../../../webdashboard/devdocs/plans/dashboard-plan.md). Stories SRV-27 to SRV-49 in `webdashboard/devdocs/stories/dashboard/`: server additions first (`group=week\|month`, CSV `local_time`, `tenant=` on `/fleet` and `/stock`, `/auth/me` permissions, serving `/dashboard` with its CSP, the test harness), then the shell, pages by value, staff pages, end-to-end and SIGNOFF | FuelBot staff and tenants |
| S8 | End-to-end & sign-off | the real app against the real server (§7), SIGNOFF, docs, kiosk plan decision-log entries | — |
| S9 | Over-the-air updates (**planned 2026-10-09**) | §3.8–3.10, §4.14; stories OTA-01 to OTA-09 in [devdocs/stories/ota/](../../../devdocs/stories/ota/README.md) (the server's are OTA-05, the dashboard's OTA-06). **App:** the version headers, the updater (kiosk plan Milestone 9) | updating deployed machines (once the server is deployed) |
| later | Deploy | hosting, TLS, backups, monitoring (once decided) | production |

The app parts of S1 and S4 follow the kiosk's own Definition of Done
(`tools/run_tests.sh`, `tools/check_boot.sh`) and its CLAUDE.md rules.

## 7. Verification

**Definition of done (every server story):** `cd server && npm test`
passes. When the app changes (S1, S4), the kiosk's checks pass too.
Dashboard changes get a screenshot that's actually looked at. Commits are
chained with `&&` after the checks.

**Contract tests (in `server/test/`, run on every `npm test`):**
1. The mock's `default` config (`mockserver/responses/config/default.json`)
   imports into a tenant + machine, and `GET /fuelbot/config` for that
   machine returns it unchanged (plus `version`).
2. The mock's invalid scenario (`invalid_duplicate_hopper`) is refused with
   the same error text the app produces. A product change that would break
   one machine's config is refused, naming that machine.
3. Sample telemetry events (every type in §3.3) and a sale store on 201,
   and a repeat returns 200 `duplicate`. Missing ids → 401; an unregistered
   machine is stored with `machine_known: false`.
4. With every `MACHINE_AUTH` mode, the table in §4.3 holds, including
   another machine's key.
5. RBAC: every row of §4.7 against every admin route (a table-driven test).

**End-to-end (S8, by hand, recorded in the SIGNOFF):**
1. `npm run db` + `npm run seed` + `npm start`; point the app's override
   `api.base_url` at `http://127.0.0.1:8790/fuelbot` (tenant `powerfuel`,
   machine `DEV00001`); `tools/dev_run.sh` boots with the server's
   config.
2. Change a product's price in the dashboard, restart the app, and see the
   new price. Override the price on the machine's menu: the override wins.
   Switch maintenance on: the app shows maintenance within one poll.
3. Order through to dispensing with `tools/fake_dispense_bridge.py`: one
   sale and a `dispense_cycle` arrive with both ids, joined in
   `/orders/:order_id`.
4. Stop the server mid-order, finish the order, start the server again:
   the queued records arrive (none lost, none doubled).
5. Upload a new product image in the dashboard (local storage), restart the
   app, and the new image shows (kiosk plan §7 step 4b, against the real
   server).
6. Boot the app with an unregistered machine id: records are kept and
   stored as unregistered, and the id shows under *Unregistered machines*.
7. Issue a machine key, provision it, set `MACHINE_AUTH=required`: the app
   works. Revoke it: the app shows cached data and **keeps** its records;
   issue a new key and the records flush.
8. RBAC: a viewer can't save; an operator limited to one machine can't see
   another machine (404) or edit products; a tenant_admin can't see another
   tenant, telemetry, faults, maintenance or audit, and sees "Not dispensed"
   with no reason on a failed sale.

## 8. Explicitly out of scope (v1)

- **Refunds** and Razorpay webhooks (payment reconciliation). The sale
  records carry what a refund process will need.
- **Alerting** (email, SMS, Slack on offline or fault). The status is
  computed; sending it somewhere is next.
- **Pushing** changes to machines. The app pulls (catalog at boot,
  maintenance every 120 s), and so does the updater (new versions every
  5 minutes, S9). Live catalog refresh is an app change.
- **Sites / locations** as their own level between tenant and machine
  (`site` is a text field on the machine for now).
- Moving a machine to another tenant (register a new machine id instead).
- Hosting, TLS, backups, CI, rate limits on kiosk routes. They come with
  the deploy milestone.
- Ad video management (`idle_video_url` is editable as a plain field only).
- Multi-currency (INR only) and localisation.
- **Email** (invites, password reset by email). Admins set temporary
  passwords (§4.4).
- A **read-only FuelBot staff role** (`platform_viewer`): planned for later.
  The role table makes it one new row (§4.7).

## 9. Open questions (product owner)

1. **Hosting and domain** (decides TLS, `COOKIE_SECURE`, and where MongoDB
   runs, e.g. Atlas).
2. **S3:** bucket name and region; public-read objects or CloudFront; one
   bucket with a per-tenant prefix (assumed) or a bucket per tenant (the
   image spec says "the tenant's bucket").
3. ~~Roles~~: answered 2026-09-26 (decision log).
4. ~~Machine ids~~: answered 2026-09-27 (decision log): generated by the server.
5. **Telemetry retention**: keep forever, or a TTL (e.g. 180 days)? Sales
   are kept forever.
6. **Refund process** (already open in the kiosk plan): who acts on failed
   dispenses, and does the dashboard need a "refunded" mark?
7. **Stock:** should an empty estimate ever mark the flavor sold out
   automatically (e.g. as an opt-in per machine)? Should low stock notify
   someone (with alerting, §8)?
8. **Dashboard (S7), before SRV-30:**
   - ~~JavaScript or TypeScript?~~ Answered: JavaScript.
   - ~~May tenant users see who recorded a refill, including a FuelBot
     staff email (`last_refill.by`)?~~ Answered 2026-09-28: yes (§0).
   - The rest is in
     [dashboard plan §10](../../../webdashboard/devdocs/plans/dashboard-plan.md).
