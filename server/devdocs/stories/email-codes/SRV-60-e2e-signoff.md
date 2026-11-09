# SRV-60: End-to-end, real Gmail check and sign-off

**As** the product owner, **I want** the whole code flow walked through
for each role and one real email sent through Gmail, **so that** I can
sign the set off.

- **Refs:** all README decisions.
- **Depends on:** SRV-55–59.
- **As built:** the product owner asked to finish every story first and run
  the full gate once at the end (2026-11-09); SRV-58's gate was stopped
  near its end with nothing failing.

## Deliverables

1. e2e walk-through `e2e/email-codes.spec.js`: tenant_admin creates an
   operator → operator's first sign-in with code → operator forgets the
   password → resets → signs in; platform_admin resends a code to a
   tenant user; viewer and operator never see "Send code".
2. A leak watch in the walk-through itself (every URL, console line and
   browser storage during both journeys, checked for each code and
   password). The existing `leak-scan.spec.js` checks API views for
   platform-only fields, which codes never reach (no response carries one;
   the server tests check that).
3. **Manual Gmail check** (the product owner's account, their app
   password in `server/.env`, never committed): run the server with
   `MAIL_TRANSPORT=smtp`, use forgot password for a real address, and
   record in SIGNOFF.md: delivered (inbox or spam), subject, time to
   arrive, the code worked, the reset succeeded. No screenshot of the
   code.
4. `docs/` deployment guide: Gmail setup (2-Step Verification, app
   password, `SMTP_*`, `MAIL_FROM`), `CODE_ENCRYPTION_KEY` generation
   (`openssl rand -base64 32`), the 500/day limit, and a note to move to
   a transactional mail service with hosting.
5. `SIGNOFF.md`; SP §0 row (2026-11-09: email codes, reverses part of
   §8), §6 (S11 done), §8 (email: invites and resets now in; alerting
   still out); READMEs and the root `CLAUDE.md` open items if anything is
   left.

## Acceptance criteria

- [x] `email-codes.spec.js` › "an operator from creation to a recovered
      password" and "staff resend a code to a tenant user" pass at 390 /
      820 / 1440. Operators and viewers have no Users page, so they never
      see "Send code" (`users.spec.js` › "operators and viewers have no
      Users page").
- [x] The walk-through's leak watch finds no code or password in any URL,
      console line or browser storage.
- [x] The server's log from the full e2e run holds no code or address
      (SIGNOFF.md).
- [ ] SIGNOFF.md has the Gmail check filled in (waiting for the product
      owner's app password).
- [x] Every earlier story's acceptance box is ticked with its test name.
