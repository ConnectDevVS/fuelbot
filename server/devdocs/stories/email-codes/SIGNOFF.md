# Email codes: sign-off (Milestone S11)

**Status: automated part PASS (2026-11-09); not signed off yet.** One
full gate run after every story was written passed at every width.
Waiting for: the one real Gmail send (below).

**Date:** 2026-11-09. **Branch:** `s11-email-codes` (from `develop`; local,
not pushed). **Stories:** SRV-55 (`93f0e6f`), SRV-56 (`983e724`), SRV-57
(`bb15f53`), SRV-59 (`4277bb5`), SRV-58, SRV-60. SRV-59 ran before SRV-58
(README).

## Automated

| Suite | Command | Result |
|---|---|---|
| Server | `cd server && npm test` | PASS, 276 |
| Dashboard lint | `cd webdashboard && npm run lint` | PASS |
| Dashboard unit | `npm test` | PASS, 98 |
| Browser, 390 / 820 / 1440 | `npm run e2e` | PASS, 436 + 11 skipped (22.7 min) |
| Kiosk and hardware untouched | `git diff develop -- kiosk/ hardware/` | empty |
| No code in the server's log | the e2e run's `[WebServer]` lines | only the seed line and 6 `[mail] … not sent (EMEMORY)` lines from the failed-mail tests: no address, no code |

Earlier gate runs while building: SRV-55 to SRV-57, `npm test` 252 → 263 →
276, all passing. SRV-59's full gate: 276 server, 98 unit, 412 browser,
all passing. SRV-58's own gate was stopped at about 400 of 430 browser
tests, all passing so far (product owner: finish the stories, then run
the tests once).

What the suites cover:

- **Server:** `codes.test.js` (alphabet, reuse with the same expiry,
  replacement after 30 minutes, one code under parallel issues,
  encryption at rest, never loaded by default, five wrong tries and
  parallel wrong tries), `mail.test.js` (file and memory transports, the
  message in both parts, a failed send with nothing logged),
  `settings.test.js` (production needs the key and SMTP), `codes-api.test.js`
  (welcome mail, admin reset and resend, `/auth/code`, the forced change
  needing the code), `forgot.test.js` (the same answer for any email,
  reset, sessions ending, limits, no code in the audit log), the RBAC
  table, and the leak test now scanning for every mailed code.
- **Browser:** `first-signin.spec.js`, `forgot.spec.js`,
  `session.spec.js` (forced change with "Email me a code"), `users.spec.js`
  (code-mail toast, failed-mail warning, Send code), and
  `email-codes.spec.js`, the walk-through: an operator from creation by a
  tenant_admin to a recovered password, and staff resending a code; it
  fails if a code or password appears in any URL, console line or browser
  storage.

## Screenshots looked at

| Story | Shots (phone, tablet, desktop) | Found → fixed |
|---|---|---|
| SRV-59 | `change-password-code-sent`, `first-signin-filled`, `first-signin-wrong-code`, `users-mail-failed`, `users-create` | the disabled "Send again" link still in link green (now muted; the spec waits for antd's colour fade); the link touching the next label when the code field shows an error (now spaced) |
| SRV-58 | `forgot`, `reset`, `reset-wrong-code`, `reset-done`, `sign-in`, `sign-in-error` | none; long addresses wrap |

## Real Gmail check

_Pending: needs the product owner's Gmail app password in `server/.env`
(`MAIL_TRANSPORT=smtp`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`)._ Record:
delivered to inbox or spam, the subject, minutes to arrive, the code
worked, the reset succeeded.

## Left out on purpose

The README's "Out of scope": magic links, two-factor at every sign-in,
invites without a temporary password, per-tenant mail templates, bounce
handling, and moving off Gmail (with hosting).
