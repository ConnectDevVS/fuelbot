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
4. Tests in `server/test/codes-api.test.js` (new); the forced-change test
   in `server/test/auth.test.js` and the audit/leak tests in
   `server/test/audit.test.js` updated; RBAC row in `audit.test.js`.
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

- [x] `codes-api.test.js` › "creating a user mails a welcome code": one
      memory message to the new address; `code_mail: 'sent'` (response and
      audit); the mail has no temporary password.
- [x] › "create still succeeds when mail fails": failing transport →
      201, `code_mail: 'failed'`, the user exists.
- [x] › "admin reset mails a code and reuses a live one".
- [x] › "admin resend sends the same code until it expires, then a new
      one" (the code aged 31 min in the database); the code is never in a
      response.
- [x] › "admin resend: self 403, disabled 409, other tenant 404, mail
      failure 502".
- [x] › "forced change needs the code": no code / empty / wrong → 400
      `invalid_code`, audited `auth.code_failed` without the code; the
      right code in lower case → 200, `must_change_password` false, code
      cleared, other sessions end.
- [x] › "a wrong current password doesn't use a code attempt".
- [x] › "five wrong codes void it; a new one is mailed on request".
- [x] › "a voluntary change ignores the code".
- [x] › "POST /auth/code works while forced, 409 after, 429 after 5" (and
      502 when mail fails).
- [x] `auth.test.js` › "a temporary password allows only /me, /password,
      /code and /logout until changed" (now with the code).
- [x] `audit.test.js` › "records user create, update … and password
      reset" (`code_mail` on both); "no password ever reaches the logs or
      the audit log" now also checks every mailed code.
- [x] `audit.test.js` RBAC row `POST /users/<unknown id>/code`: 404 for
      platform_admin and tenant_admin (allowed, no such user), 403 for
      operator and viewer.
