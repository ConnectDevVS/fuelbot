# OTA-05 — Server: releases, rollout and the update API

**As** FuelBot staff, **I want** the server to hold releases and decide
which machine gets which version when, **so that** a rollout is staged,
pausable and visible, and every machine knows what to install.

Refs: README decisions 3, 5, 8, 9; server plan §3.1, §3.8–3.10, §4.14;
server/CLAUDE.md.
Depends on: OTA-01 (the version headers).
DoD: `cd server && npm test`. Commit `OTA-05: …`.

## Deliverables

```
server/src/models/Release.js, UpdateEvent.js     # new
server/src/models/Machine.js                     # software fields
server/src/routes/kiosk.js                       # /update, /update/report, /releases/:version/:file
server/src/routes/releases.js                    # admin API (new)
server/src/routes/machines.js                    # a machine's software panel and actions
server/src/services/releases.js                  # verify a bundle; who gets what (pure, unit-tested)
server/src/auth/rbac.js                          # releases:manage (platform only)
server/src/settings.js, .env.example             # RELEASES_DIR, RELEASE_PUBLIC_KEY, UPDATE_WINDOW, …
server/test/releases.test.js, update-api.test.js
server/devdocs/plans/server-plan.md              # §3.8–3.10 and §4.14 as built
```

## Spec

### Versions on the machine record

Every identified kiosk call stores `X-App-Version`, `X-Bridge-Version`,
`X-Firmware-Version` (OTA-01) on the machine, next to *last seen*
(`software: {app, bridge, firmware, os, seen_at}`). `os` comes from the
updater's `GET /fuelbot/update`. **Platform-only:** none of it appears in a
tenant's response (the dashboard's leak scan gains these keys).

### `Release`

`{version (unique), manifest, files: [{name, size, sha256}], notes,
status: draft | rolling | paused | done | withdrawn, stages: [{machines:
[ids]} | {percent: 10} | {percent: 100}], stage (index), created_by,
published_at, …}`.

- **Upload** (`POST /api/v1/releases`, the raw `.tar` as the body, up to
  `RELEASE_MAX_MB`, default 200, streamed to `RELEASES_DIR`): the server
  checks the signature with `RELEASE_PUBLIC_KEY` (Node's `crypto` supports
  Ed25519) and every file's sha256, and refuses anything that doesn't
  verify. The same checks as the machine, so a bad bundle never reaches one.
- **Publish** starts stage 0, which must name at least one test machine.
  **Promote** moves to the next stage; **pause**, **resume**, **withdraw**.
- **Install now** on a release forces every machine in its current stage.

### Who gets what (`services/releases.js`, pure functions)

For a machine:

1. A **pin** wins (`software.pinned_version`; a published, not withdrawn
   release).
2. Otherwise the newest release that is `rolling` or `done`, not
   withdrawn, and whose stages up to the current one include the machine.
   A percent stage includes a machine when
   `hash(machine_id + version) mod 100 < percent`, so the same machines stay
   in as the percentage grows.
3. A **paused** release reaches no new machines; machines already on it
   stay.
4. A machine on a **withdrawn** version is sent the newest release rule 2
   gives it (in practice the previous one, which it still has on disk).
5. Below the target's `min_from_version` → that version first.

The answer carries `force` (a machine's "Update now", or the release's
"Install now", until the machine reports `healthy` or `failed`), the
window (the machine's own, else `UPDATE_WINDOW`, default `02:00-05:00` in
`DISPLAY_TZ`), `max_wait_days` (`UPDATE_MAX_WAIT_DAYS`, 7) and `attempt` (a
counter staff bump with "Retry", so a machine retries a version it rolled
back).

### Reports and auto-pause

`POST /fuelbot/update/report` stores an `UpdateEvent` (idempotent on
`event_id`; `log_tail` capped at 20 KB) and updates the machine's
`software.last_update`. A `rolled_back`, or a `failed` other than
`no_space`, **pauses the release** (README decision 9), with an audit entry.

### Admin API (platform only; `releases:manage` to act, `telemetry:read` to see)

| Method and path | Does |
|---|---|
| `GET /api/v1/releases`, `GET /api/v1/releases/:version` | list; one release with counts per state (target, downloaded, installed, healthy, rolled back, failed, behind) |
| `POST /api/v1/releases` | upload a bundle (draft) |
| `POST /api/v1/releases/:version/{publish,promote,pause,resume,withdraw,install-now,retry}` | rollout actions |
| `GET /api/v1/tenants/:tid/machines/:mid/software` | versions, target and why, last update, history (with log tails) |
| `PUT /api/v1/tenants/:tid/machines/:mid/software` | `{pinned_version, window}` (`If-Match`, like the machine's other edits) |
| `POST /api/v1/tenants/:tid/machines/:mid/software/update-now` | force this machine's target |

Every action is audited (`release.upload`, `release.publish`, …,
`machine.update_now`, `machine.pin`). `/fleet` gains a `software` block
(versions, behind or not) **for staff only**.

## Acceptance criteria

- [ ] Version headers are stored; tenant roles never see them (`/fleet`,
      machine, config preview); the leak-scan key list includes them.
- [ ] Upload: a good bundle → draft; a bad signature, a bad hash or a
      missing file → 400 with the reason; too big → 413.
- [ ] Targeting (unit tests of the pure functions): pin; stage 0 only the
      test machines; 10 % picks a stable set that stays in at 100 %;
      paused; withdrawn → the previous release; `min_from_version`.
- [ ] `GET /fuelbot/update` needs the machine key (401 without, as config);
      returns `stay` / `install` with force, window and attempt.
- [ ] Release files: machine key required, `Range` requests work, only
      files of published releases.
- [ ] Reports are idempotent; `rolled_back` pauses the release; history
      shows the masked log tail.
- [ ] Every action audited; only `releases:manage` can act.
