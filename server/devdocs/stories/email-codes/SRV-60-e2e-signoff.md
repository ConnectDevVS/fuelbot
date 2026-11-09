# SRV-60: End-to-end, real Gmail check and sign-off

**As** the product owner, **I want** the whole code flow walked through
for each role and one real email sent through Gmail, **so that** I can
sign the set off.

- **Refs:** all README decisions.
- **Depends on:** SRV-55–59.

## Deliverables

1. e2e walk-through `e2e/email-codes.spec.js`: tenant_admin creates an
   operator → operator's first sign-in with code → operator forgets the
   password → resets → signs in; platform_admin resends a code to a
   tenant user; viewer and operator never see "Send code".
2. The leak scan (the existing e2e check for secrets in URLs, storage and
   console) extended to codes.
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

- [ ] `email-codes.spec.js` passes at 390 / 820 / 1440.
- [ ] The leak scan finds no code in URLs, storage, console or the React
      Query cache.
- [ ] `grep` of the server log from a full e2e run finds no code (the
      e2e mailer knows every code sent; the spec checks none appear).
- [ ] SIGNOFF.md has the Gmail check filled in.
- [ ] Every earlier story's acceptance box is ticked with its test name.
