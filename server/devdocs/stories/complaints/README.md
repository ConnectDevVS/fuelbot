# Complaints — story set (Milestone S10)

Tenant users raise complaints from the web dashboard and follow them up
in a comment thread; FuelBot staff answer and move each one through
**Open → With service → Closed**. Server and dashboard only: the kiosk
app, bridge and firmware don't change.

- **Plans:**
  - [server-plan.md](../../plans/server-plan.md) §4.15 (the whole design:
    model, API, rules), §4.7 (the new permissions), §0 (2026-11-09 row),
    §6 (S10). Cited as "SP §n".
  - [dashboard-plan.md](../../../../webdashboard/devdocs/plans/dashboard-plan.md)
    §5.20 (the pages), §3.1 / §3.3 (nav and URLs), §6 (permission → UI),
    §7 (error codes). Cited as "DP §n".
- **Builds on:** users, RBAC and audit (S2), the dashboard shell, patterns
  and e2e harness (S7).
- **Conventions:** [server/CLAUDE.md](../../../CLAUDE.md),
  [webdashboard/CLAUDE.md](../../../../webdashboard/CLAUDE.md).

## Goals

1. Any tenant user can raise a complaint in under a minute, from a phone.
2. Everyone sees where their complaint stands and what FuelBot said,
   without email or phone calls.
3. FuelBot staff see every open complaint across tenants, newest
   activity first, and every status change says why.
4. No one sees a complaint they shouldn't: an operator or viewer sees only
   their own; nothing platform-only leaks through the thread.

## Execution order

| # | Story | Depends on | Produces |
|---|-------|-----------|----------|
| 50 | [Complaints: model, permissions, raise and read](SRV-50-model-raise-read.md) | S2 | `Complaint` model, `Tenant.complaint_seq`, `complaints:*` permissions (incl. the tenant-only exception), `POST`/`GET /tenants/:tid/complaints`, `GET …/:number`, `GET /complaints` (staff), views, audit, RBAC rows |
| 51 | [Comments, status changes, reopen](SRV-51-comments-status.md) | 50 | `POST …/:number/comments`, `POST …/:number/status` (comment required, `from` check), reopen for tenant users, `last_activity_at`, audit, RBAC rows |
| 52 | [Dashboard: complaints list and raise](SRV-52-dashboard-list-raise.md) | 50 | nav item, `/t/:tid/complaints` and staff `/complaints` list (status filter, cards on phone), Raise dialog, strings, error codes, e2e seed |
| 53 | [Dashboard: complaint page](SRV-53-dashboard-detail.md) | 51, 52 | `/t/:tid/complaints/:number`: header, timeline, comment box, staff status control, tenant Reopen |
| 54 | [End-to-end and sign-off](SRV-54-e2e-signoff.md) | all | role walk-throughs at three widths, leak scan extended, SIGNOFF.md, plan §0/§6 status, READMEs |

## Definition of Done (every story)

- **Server stories (50, 51):** `cd server && npm test` passes, with a row
  in the RBAC table test (`server/test/audit.test.js`) for every new route
  and every role.
- **Dashboard stories (52–54):**
  `cd webdashboard && npm run lint && npm test && npm run build && npm run e2e`
  passes, and `cd server && npm test` too (e2e runs the real server).
- **Screenshots are looked at** at phone 390 / tablet 820 / desktop 1440
  for every UI story; the commit message says so.
- Each acceptance item names its test (file + "it"/test title).
- **Commits:** one per story, `SRV-NN: <title>`, chained with `&&` after
  the checks; stage named files only, never `git add -A`.

## Decisions

### Product owner (2026-11-09)

1. **Who raises:** `tenant_admin`, `operator`, `viewer`. A `platform_admin`
   doesn't raise complaints; they view, comment and change status.
2. **Who sees what:** an operator or viewer sees only the complaints they
   raised; a `tenant_admin` sees every complaint in their tenant; a
   `platform_admin` sees every complaint in every tenant. Everyone who
   can see a complaint can comment on it.
3. **Statuses:** `open` (on creation), `with_service`, `closed`.
   A `platform_admin` can change between any two, in any direction.
   **Every status change needs a comment.**
4. **Reopen:** the complaint's creator and their tenant's `tenant_admin`
   can reopen a **closed** complaint (→ `open`), with a comment.
5. **Content:** a title and a description. **No machine link.**

### Made while writing this set (can be revisited)

1. **Permissions** (SP §4.7):
   - `complaints:raise`: the three tenant roles; **tenant-only**, so not
     in the platform set. This is the first exception to "platform_admin
     holds every tenant_admin permission": `TENANT_ONLY` in `rbac.js`
     (`raise` and `reopen`), and the divergence test allows exactly that
     list.
   - `complaints:read_all`: `tenant_admin` (their tenant) and
     `platform_admin` (all tenants). Without it, a user sees only
     complaints they raised.
   - `complaints:comment`: every role, on complaints they can see.
   - `complaints:reopen`: the tenant roles, on complaints they can see
     (which already means "creator or tenant_admin"); tenant-only, since
     staff have `complaints:status`.
   - `complaints:status`: `platform_admin` only (`PLATFORM_ONLY`).
2. **Machine scope doesn't apply.** Complaints have no machine, so an
   operator limited to some machines sees the same complaints as one with
   all of them (their own).
3. **Out of sight is 404,** like every other resource: an operator asking
   for a colleague's complaint gets `not_found`, never 403.
4. **Nothing is edited or deleted.** Complaints, comments and status
   changes are append-only; the thread is the record. A typo is fixed by a
   new comment.
5. **Comments on a closed complaint are allowed** and don't reopen it.
   Only Reopen (or staff) changes the status.
6. **A status change is one timeline entry:** `{kind: 'status', from, to,
   text}`. The body carries `from` (the status the user saw); if the
   complaint has moved since, **409** `status_changed` and the dashboard
   reloads. Setting the current status again is **400** `status_unchanged`.
7. **Numbers:** each complaint gets a per-tenant number (`#1`, `#2`, …)
   from `Tenant.complaint_seq` (atomic `$inc`). URLs use it:
   `/tenants/:tid/complaints/:number`.
8. **Limits:** title 3–120 characters, description 1–4000, comment
   1–2000, after trimming; plain text, newlines kept, rendered as text
   (no Markdown, no links made clickable). At most **300 timeline
   entries** per complaint (409 `complaint_full`), which keeps the
   document small.
9. **Who wrote it:** tenant users see a tenant author's name (or email if
   no name) and a FuelBot author as **"FuelBot support · <name>"**, without
   the staff email. Staff see names and emails. (Refills show staff
   emails to tenants (SP §0, 2026-09-28); complaints don't, because the
   thread reads as a support conversation.)
10. **Disabled users:** their complaints stay, visible to their
    tenant_admin and to staff. A disabled user can't sign in, so can't
    comment.
11. **Sorting:** lists are newest **activity** first (`last_activity_at`,
    then `_id`), with the usual opaque cursor. Filters: `status` (comma
    list), and for staff `tenant`. The dashboard's default filter is
    "Open + With service"; "All" is one click.
12. **Platform-only data stays out of the complaint views**: no IPs, no
    audit fields, no machine status. What staff write in a comment is
    visible to the tenant by design; the dashboard says so under the
    comment box.
13. **Audit:** `complaint.create`, `complaint.comment`, `complaint.status`
    (with `from`/`to`), target `complaint:<number>`. The audit entry holds
    no comment text; the complaint is the record.
14. **No notifications in v1** (no email in v1, SP §8). Staff find new
    activity by the default list sort. An unread count or badge is later.

## Out of scope

Attachments and photos (S5 storage is deferred), categories, priorities,
assigning to a staff member, SLAs, email or push notifications, a
complaint linked to an order or machine, editing or deleting, and the
kiosk raising complaints itself.
