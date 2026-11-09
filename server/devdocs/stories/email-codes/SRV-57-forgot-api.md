# SRV-57: Forgot password API

**As** a user who forgot their password, **I want** to get a code by
email and set a new password with it, **so that** I don't have to find an
admin.

- **Refs:** README decisions (product owner 2, 3, 6, 8; planning 7–10,
  13), README "Design" routes table; SP §4.4, §4.6, §4.16.
- **Depends on:** SRV-55. **Server only.**

## Deliverables

1. `server/src/routes/auth.js`: `POST /auth/forgot`, `POST /auth/reset`
   (before `router.use(requireSession…)`), each with its limiter.
2. Tests in `server/test/forgot.test.js`; `app.locals.background` (work
   after the response) and `ctx.idle()` in `test/helpers.js` to await it.
3. Docs: SP §4.4 routes, §4.6 (rate limits); `server/README.md`.

## Spec

- **`POST /auth/forgot {email}`** → always **200 `{ok: true}`** (also
  for an unknown email, a disabled user or a disabled tenant: no mail
  then). For an active user: `issueCode` + mail (`forgot`); a mail
  failure is logged as `mail_failed` without the address and still
  answers 200. Audited `auth.code_sent` (only when a user exists).
  Limiter: 5 per 15 min per IP + email → 429 `too_many_attempts`.
  The response time shouldn't reveal whether the email exists: answer
  before sending (send after `res.json`, errors caught), so known and
  unknown emails take about the same time.
- **`POST /auth/reset {email, code, new}`**: missing fields → 400
  `invalid_body` (details name each field, `required`); `new` shorter than 10 → 400 `weak_password` (checked
  first, so a typo in the password doesn't burn a code attempt); unknown
  email, disabled user, disabled tenant or a bad code → **400
  `invalid_code`** (a wrong code counts an attempt and is audited
  `auth.code_failed`). Success: new hash, `must_change_password = false`,
  code cleared, `token_version += 1`, **no cookie set** →
  `200 {ok: true}`. Audited `auth.password_reset`. Limiter: 10 per
  15 min per IP + email.
- Both routes need the `X-Requested-With` header like every non-GET.

## Acceptance criteria

- [x] `forgot.test.js` › "forgot mails a code to an active user" (email
      upper-cased with spaces still matches).
- [x] › "forgot answers the same for unknown, disabled user and disabled
      tenant, and mails nothing" (and an empty email).
- [x] › "forgot resends the same code within 30 min, a new one after".
- [x] › "forgot answers 200 when mail fails, and logs no address".
- [x] › "reset with the right code sets the password and ends sessions":
      old session → 401; sign-in with the new password works; code
      cleared (the same code again → `invalid_code`); audited.
- [x] › "reset clears must_change_password".
- [x] › "reset with a wrong, expired or unknown-email code is
      invalid_code" (and a disabled user's); › "five wrong codes void it"
      (every try audited, `voided` on the fifth).
- [x] › "weak password and missing fields are checked before the code".
- [x] › "reset doesn't sign in" (no `Set-Cookie`).
- [x] › "forgot and reset are rate-limited per IP + email" (a new address
      per test: the limiters live as long as the file's app).
- [x] › "works without a session but needs the dashboard header".
- [x] › "the audit log never holds a code".
