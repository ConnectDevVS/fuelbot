# FuelBot release notes

## 0.1.0: first release (`develop`, 13 October 2026)

The first complete FuelBot system: a rewritten kiosk app for the vending
machine, a new hardware bridge and updated firmware, a backend server, and a
web dashboard for running a fleet of machines. Everything is on `develop` as
of commit `cb8ee54`; there are no earlier releases.

| Component | Version | Runs on |
|---|---|---|
| Kiosk app (Godot 4.7) | 0.1.0 | the machine's screen (1080 × 1920 portrait; Raspberry Pi target) |
| Hardware bridge (`udprxtx.py`) | 1.0.0 | the machine, between the app and the board |
| Firmware (`VM_code.ino`) | 1 | the machine's Arduino board |
| Backend server | 0.1.0 | a Linux server (Node.js 22, MongoDB Atlas) |
| Web dashboard | 0.1.0 | served by the backend at `/dashboard/` |

### Highlights

- **Order a shake end to end:** attract screen → flavor list → details →
  pay by **UPI QR** (Razorpay) → the machine mixes and dispenses.
- **Managed from the web:** prices, menus, maintenance and new machines are
  set in the dashboard and reach the machines, without touching them.
- **Every sale and machine event is recorded:** sales, dispense cycles and
  faults reach the server even across network drops.
- **The machine protects itself:** a homing fault or a dead bridge takes it
  out of service and it comes back automatically when the problem clears;
  an order in progress always finishes first.
- **Running on staging** at `https://gmrfuelbot.staging.griffinmarkapps.com`,
  with a step-by-step deployment guide for new servers.

---

### Kiosk app

- **Screens** built to the on-device designs: attract (looping video), flavor
  list (up to six, sold-out flavors greyed), flavor details (ingredients,
  allergens, nutrition), Scan to pay, dispensing (blending, done, failed)
  and maintenance.
- **Payments: UPI QR only** through Razorpay. A QR per order with the order
  ID in its notes; it closes on cancel, failure or expiry (3 minutes). If a
  customer pays just as they press Cancel, the drink is still made. Card
  payments are not supported (product decision).
- **Catalog from the server**: flavors, prices, offers, bases, nutrition and
  maintenance come from the backend; the app keeps the last good catalog
  and a bundled fallback for offline starts. Invalid catalogs are refused.
- **Flavor images** come from the catalog's `image_url` (S3), cached on the
  machine; the bundled images are the offline fallback.
- **Machine identity**: each machine has a tenant, an 8-character machine ID
  and a machine key, sent on every backend call.
- **Durable reporting**: sales and telemetry are written to disk before
  sending and retried until the server accepts them.
- **Maintenance screen** shows why the machine is out of service, its
  machine ID, server and bridge status, and the software, bridge and
  firmware versions.

### Machine: bridge and firmware

- **New bridge protocol (v2)**: the app sends one order message only after
  payment succeeds; results come back as done, timeout or rejected. The
  bridge refuses orders while dispensing, recovering or faulted, and never
  waits without a deadline.
- **Firmware**: reports every stage of a cycle, validates commands, homes
  with a time limit and retries after 1, 2, 4 and 8 minutes, then every 10
  minutes, instead of resetting in a loop.
- **Telemetry**: the bridge reports each dispense cycle, machine faults and
  recovery, and a heartbeat every 10 seconds.
- **Out of service automatically** on a homing fault, or when the bridge
  stops sending heartbeats for 30 seconds; back in service as soon as it
  recovers.
- **Versions reported** (start of over-the-air updates, Milestone 9): the
  app sends its own, the bridge's and the firmware's versions with each
  backend call.

### Backend server

- **Kiosk API** (`/fuelbot`): the machine's catalog, sales and telemetry,
  authenticated with the machine key.
- **Companies (tenants), users and roles**: FuelBot staff (platform admin)
  see everything; a company's admins and operators see only their own
  machines. Permissions are checked on the server for every request.
- **Products, machines and menus**: a product library per company, machines
  registered from the dashboard (the server generates the machine ID and
  key), per-machine menus with price overrides, maintenance on or off.
- **Sales and reports**: lists, day / week / month summaries, CSV export,
  order details with the dispense timeline (staff).
- **Estimated stock** per hopper from recorded refills and actual dispenses
  (the machines have no level sensors), with "refill soon" warnings.
- **Fleet health**: online/offline, open faults, fault history.
- **Audit log** of every change made through the dashboard.
- **Security**: passwords and machine keys stored only as hashes and never
  logged; sign-in rate limiting; strict browser security policy for the
  dashboard.

### Web dashboard

- **For companies**: Home (today's sales, revenue, flavor mix), Sales
  (summary, list, CSV, not-dispensed orders, printable report), Stock and
  refills, Machines (register, provisioning card, keys, menu, settings,
  bases), Products, Users and Company.
- **For FuelBot staff**, in addition: Fleet, Tenants, a machine's
  Maintenance, Telemetry and Faults tabs, and fleet-wide Faults, Telemetry,
  Audit and Unregistered machines.
- **Every page at phone, tablet and desktop widths.**
- **No platform-only data on company screens**: fault codes, failure
  reasons, telemetry and maintenance details are staff-only (checked by an
  automated scan of every page and response).
- **Staging tag**: a non-production server shows a small tag (e.g.
  "STAGING") on the sign-in page.

### Deployment and operations

- **Deployment guide**: `devdocs/deployment_guide.md`, from an empty Ubuntu
  server to a working dashboard and connected kiosk (Atlas, pm2, nginx,
  HTTPS, first admin, seeding, updates and rollback, production checklist).
- **Env files per environment**: `ENV_FILE=.env.dev` / `.env.production`
  picks the settings file; a missing file stops the server instead of
  running on development defaults.
- **New settings in this release** (add by hand to each server's env file):
  `ENV_LABEL` (optional, staging only).

### Developer tooling

- Automated tests for every part: GDScript (app), Python (mock server,
  bridge, test fakes, firmware on a host simulator), server (Node), and
  dashboard unit and browser tests (Playwright at three screen widths).
- Test stand-ins: a mock backend and Razorpay, a fake bridge, a fake Arduino
  over a serial pty, and a firmware simulator, so the full order flow runs
  without hardware.
- Graphify knowledge-graph setup for code navigation (server, dashboard and
  Python tools; not the Godot app).

---

### Verified

- **Automated**: app 225 tests, Python 81, server 201, dashboard unit 94;
  dashboard browser tests at phone, tablet and desktop (2026-09-30), and
  desktop again for this release (120 passed).
- **Real app against the real server** (2026-09-29): a price change and a
  menu override reached the kiosk; maintenance on/off took effect within
  seconds; a paid order and a timed-out order appeared correctly in the
  dashboard; a machine registered and provisioned from the dashboard
  booted with its menu.
- **Hardware stand-ins** (Level 0 and 1): the full order flow, homing faults,
  retries and automatic recovery.

### Known limitations

- **Not yet tested on the real machine** (Levels 2 and 3): the first build
  for the real board, tuning of the dispense timing, and the homing-fault
  checks with a disconnected limit switch.
- **Hoppers 5 and 6** aren't wired: enable flavors on hoppers 1–4 only.
- **Raspberry Pi packaging** (export, kiosk boot) and **over-the-air
  updates** are next (Milestones 8 and 9); OTA-01 is the only part included.
- **Razorpay with real (test-mode) keys** still needs its manual check by
  the product owner; the automated tests use a mock.
- **Product image upload** and the **S3 bucket** are not set up yet: images
  are set by URL, and the bundled images show meanwhile.
- **Refunds** for paid orders that fail to dispense aren't decided; the
  customer sees a support message.
- The backend isn't in production yet: staging only.

### Action items

- **Rotate the old Razorpay live key** quoted in the original plan
  (`devdocs/plans/greenfield-rewrite.md`).
- **Staging**: replace the seeded `DEV00001` dev key in the dashboard if the
  database was seeded.
- **Before production**: run the full dashboard browser suite at all three
  widths on the release commit, and follow the guide's production
  checklist.
