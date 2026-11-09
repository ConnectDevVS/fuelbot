# Complaints: sign-off (Milestone S10)

**Status: signed off (2026-11-09). Result: PASS.** Two full gate runs in a
row passed at every width; the leak scan covers every complaint page for
every tenant role. Left out: the live run (product owner's decision,
below).

**Date:** 2026-11-09. **Branch:** `s-10-complaints` (local, not pushed).
**Stories:** SRV-50 (`b18432a`), SRV-51 (`65ce377`), SRV-52 (`cbb111c`),
SRV-53 (`b3fe6ea`), SRV-54.

## Automated

| Suite | Command | Run 1 | Run 2 |
|---|---|---|---|
| Server | `cd server && npm test` | PASS, 231 | PASS, 231 |
| Dashboard lint | `cd webdashboard && npm run lint` | PASS | PASS |
| Dashboard unit | `npm test` | PASS, 96 | PASS, 96 |
| Browser, 390 / 820 / 1440 | `npm run e2e` | PASS, 397 + 11 skipped (20.8 min) | PASS, 397 + 11 skipped (20.7 min) |
| Kiosk and hardware untouched | `git diff main -- kiosk/ hardware/` | empty | empty |

**Before these two runs:** two gate runs (SRV-53's first and SRV-54's
first) took about 40 and 60 minutes instead of 20, and failed on
timeouts only, in tests that don't touch complaints (a test-data reset
past 30 s, the telemetry tab's rows, a click). Re-run unchanged, each
passed at normal speed. The leak scan's limit went from 3 to 5 minutes,
since each tenant role now also opens every complaint it can see.

What the suites cover for complaints:

- **Server** (`test/complaints-api.test.js`, the RBAC table, the tenant
  sweep): raising per role and staff refused; per-tenant numbers under 20
  concurrent raises; validation after trimming; scope (operator and viewer
  their own, tenant_admin the tenant, staff all; out of scope 404); status
  filter and newest-activity paging; staff email and user ids hidden from
  tenant views; comments in every status; staff status changes in every
  direction with a required comment; stale `from` 409 (two staff at
  once: exactly one wins); `status_unchanged`; reopen by the creator and a
  tenant_admin only; the 300-entry cap; audit entries without text.
- **Browser** (`e2e/complaints.spec.js`, three widths): raise, lists per
  role, staff's all-tenants list and tenant filter, the status filter in
  the URL, form and server field errors, the discard confirm; the
  complaint page per role, a staff status change and what the tenant then
  sees, the comment required for a status change, a tenant_admin
  reopening a colleague's complaint, Not found for a colleague's number,
  the conflict alert keeping the text, text rendered as text.
- **Leak scan** (`e2e/leak-scan.spec.js`): every tenant role opens every
  complaint it can see; no platform-only key (a complaint's `status` is
  allowed in complaint responses only), no staff email or user id in any
  complaint response or page; Globex sees none of PowerFuel's complaints.
- **Walkthrough** (`e2e/walkthrough.spec.js`): every role's nav pages,
  now including Complaints / All complaints and a complaint page.

## Screenshots looked at

| Story | Shots (phone, tablet, desktop) | Found → fixed |
|---|---|---|
| SRV-52 | list (owner, staff, desk), Raise sheet, the More sheet, walkthrough pages | the empty text for a user whose only complaint is closed; the counter overlapping the help on a phone; the comments column clipped on a tablet; staff's phone More sheet taller than the screen (its title and Close off the top) |
| SRV-53 | complaint (desk), closed (look), staff with a status chosen | seeded complaints all "raised today", after their own answers (the seed now sets `created_at`); a shot taken during antd's colour fade |
| SRV-54 | the walkthrough's complaint page per role: 18 shots taken (each also checked for overflow by the harness), 3 looked at by eye (staff desktop, boss phone, ops tablet); the others are the same page SRV-53's shots covered | none: staff see emails, the tenant and the status select; Globex only its own; an operator no status control |

## Live run

**Not done, by the product owner's decision (2026-11-09).** The dev server's
database is the Atlas `fuelbot` database, and a live run would leave test
users and complaints there. The browser tests run the real server (on an
in-memory MongoDB) and the built dashboard end to end, through the same
steps the live run would take: raise, answer, With service, Closed,
reopen, read the thread as the tenant admin.

## Left out on purpose

Attachments, categories, priorities, assignment, notifications (no email
in v1), links to a machine or order, editing or deleting (the README's
"Out of scope").
