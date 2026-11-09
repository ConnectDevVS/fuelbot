# SRV-56: Codes for new users, admin resets and first sign-in

**As** an admin, **I want** a new user (or one whose password I reset) to
get a code by email that they need along with the temporary password,
**so that** the temporary password alone can't open the account. **As** a
new user, **I want** to ask for a code again if mine expired.

- **Refs:** README decisions (product owner 3–5, 8; planning 4–7, 9, 13),
  README "Design" routes table; SP §4.4, §4.16.
- **Depends on:** SRV-55. **Server only.**

## Deliverables

1. `server/src/routes/users.js`: mail on `POST /users` and
   `POST /users/:id/password`; new `POST /users/:id/code`.
2. `server/src/routes/auth.js`: `POST /auth/code`; `code` on
   `POST /auth/password`.
3. `server/src/auth/session.js`: `POST /auth/code` in `WHILE_CHANGING`.
4. Tests in `server/test/users.test.js`, `server/test/auth.test.js`;
   RBAC rows in `server/test/audit.test.js`.
5. Docs: SP §4.4 routes and "Accounts get a temporary password"
   paragraph; `server/README.md`.

## Spec

- **`POST /users`**: after `User.create`, `issueCode` + mail
  (`welcome`). Response `201 {user, code_mail: 'sent' | 'failed'}`. The
  `user.create` audit entry gains `code_mail`.
- **`POST /users/:id/password`**: after the save, the same with
  `reset_by_admin`; response adds `code_mail`; audit gains `code_mail`.
  A live code is reused (decision 3).
- **`POST /users/:id/code`** (`users:manage`, `findVisible`): yourself →
  403 `forbidden_self` (you're signed in; use forgot password if you need
  one); a disabled user → 409 `user_disabled`. Mails `requested` →
  `200 {ok: true, expires_at}`, or **502 `mail_failed`** (the code stays
  issued). Audited `user.code_sent`.
- **`POST /auth/code`** (signed in): only while `must_change_password`,
  else 409 `not_needed`. Limiter: 5 per 15 min per IP + email
  (`429 too_many_attempts`). Mails `requested` → `200 {ok: true,
  expires_at}` or 502 `mail_failed`. Audited `auth.code_sent`.
- **`POST /auth/password`** while `must_change_password`: order of
  checks: `current` wrong → 400 `wrong_password` (no code attempt used);
  then `code` via `checkCode` → 400 `invalid_code` (audited
  `auth.code_failed`, `voided` on the fifth); then `same_password` /
  `weak_password`. Success also clears the code. Not forced: `code`
  ignored, behaviour unchanged.

## Acceptance criteria

- [ ] `users.test.js` › "creating a user mails a welcome code": one
      memory message to the new address; `code_mail: 'sent'`; the mail
      has no temporary password.
- [ ] › "create still succeeds when mail fails": failing transport →
      201, `code_mail: 'failed'`, the user exists.
- [ ] › "admin reset mails a code and reuses a live one".
- [ ] › "admin resend sends the same code until it expires, then a new
      one" (clock moved 31 min).
- [ ] › "admin resend: self 403, disabled 409, other tenant 404,
      mail failure 502".
- [ ] `auth.test.js` › "forced change needs the code": no code / wrong
      code → 400 `invalid_code`, password unchanged; right code → 200,
      `must_change_password` false, code cleared, other sessions end.
- [ ] › "wrong current password doesn't use a code attempt".
- [ ] › "five wrong codes void it; a new one is mailed on request".
- [ ] › "voluntary change ignores code".
- [ ] › "POST /auth/code works while forced, 409 after, 429 after 5".
- [ ] `audit.test.js` RBAC row for `POST /users/:id/code` for every role
      (platform_admin and tenant_admin 200 in scope, others 403,
      out-of-scope 404). `/auth/code` is covered by the
      `password_change_required` test's allowlist.
