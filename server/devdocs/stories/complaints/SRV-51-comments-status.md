# SRV-51: Comments, status changes, reopen

**As a** tenant user, **I want** to add comments under my complaint and
reopen it if the problem comes back, **so that** FuelBot has the whole
story. **As** FuelBot staff, **I want** to answer and to move a complaint
to With service or Closed with a reason, **so that** the tenant always
knows why.

- **Refs:** SP §4.15; README decisions (product owner 2–4; planning 4–6,
  8, 13).
- **Depends on:** SRV-50. **Server only.**

## Deliverables

1. `server/src/routes/complaints.js`: `POST …/:number/comments`,
   `POST …/:number/status`.
2. Tests in `server/test/complaints-api.test.js`; RBAC rows in
   `server/test/audit.test.js`.
3. Docs: SP §4.15 routes table complete; `server/README.md`.

## Spec

- `POST /tenants/:tid/complaints/:number/comments` (`complaints:comment`,
  on a complaint in the caller's `complaintScope`) `{text}` (1–2000 after
  trim) → **201** `{complaint}` (detail view). Appends
  `{kind: 'comment', text, author…, fuelbot: isPlatform(user)}`, sets
  `last_activity_at`. Allowed in **every** status; the status doesn't
  change. Audited `complaint.comment` (no text).
- `POST /tenants/:tid/complaints/:number/status` `{to, from, text}`, all
  required, `text` 1–2000:
  - **platform** (`complaints:status`): `to` any of the three statuses.
  - **tenant users** (`complaints:reopen`, in scope): only
    `from: 'closed', to: 'open'`; any other `to` → 403 `forbidden`.
  - `from` ≠ the stored status → **409** `status_changed`
    `{status: <current>}` (nothing saved).
  - `to` = the stored status → 400 `status_unchanged`.
  - Missing or empty `text` → 400 `invalid_body`, field `text`
    ("required"). This is the "comment is mandatory" rule.
  - Appends `{kind: 'status', from, to, text, …}`, sets `status` and
    `last_activity_at`; **201** `{complaint}`. Audited
    `complaint.status`, `before: {status: from}`, `after: {status: to}`.
- **One atomic update** per write:
  `findOneAndUpdate({...scope, number, status: from, 'events.299': {$exists: false}}, {$push, $set})`.
  When it matches nothing, re-read to tell 404 / 409 `status_changed` /
  409 `complaint_full` apart. No read-modify-write races.
- **300 entries max** (`events.299` exists) → 409 `complaint_full` for
  comments and status changes alike.

## Acceptance criteria

- [ ] `complaints-api.test.js` › "creator and tenant_admin comment; staff
      comment": desk on own, owner on desk's, staff on any → 201, entries
      in order, `fuelbot` true only for staff; `last_activity_at` moves.
- [ ] › "out of scope can't comment": ops on desk's → 404; boss (globex)
      on powerfuel's → 404.
- [ ] › "comments on a closed complaint keep it closed".
- [ ] › "staff change status in any direction with a comment": open →
      with_service → closed → open → closed, each 201 with one `status`
      entry carrying `from`, `to`, `text`; audit entries match.
- [ ] › "a status change without a comment is refused": no `text`, `""`,
      `"   "` → 400 `invalid_body` field `text`; status unchanged.
- [ ] › "stale from is 409": two staff both send `from: 'open'`; one 201,
      the other 409 `status_changed` with `status: 'with_service'`.
- [ ] › "same status is 400 status_unchanged".
- [ ] › "creator and tenant_admin reopen a closed complaint": desk on own
      and owner on desk's: `closed → open` 201; ops on desk's → 404.
- [ ] › "tenant users can't set other statuses": desk `to: 'closed'` or
      `with_service` → 403; reopen of an open complaint (`from: 'open'`) →
      400 `status_unchanged`.
- [ ] › "a full thread is 409 complaint_full": 300 entries, then a comment
      and a status change → 409; nothing appended.
- [ ] `audit.test.js` RBAC rows (on complaint #1, raised by the RBAC
      operator): `…/1/comments` and `…/1/status` with an empty body →
      400 for every role that can see #1 (all hold `complaints:comment`
      and `status` or `reopen`); the viewer, who can't see #1 → 404.
