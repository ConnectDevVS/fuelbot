# SRV-58: Dashboard: forgot and reset pages

**As** a user who forgot their password, **I want** a "Forgot password?"
link on sign-in that gets me a code and lets me set a new password,
**so that** I can sign in again on my own.

- **Refs:** README decisions (product owner 6; planning 7, 10); DP §5.1,
  §7.
- **Depends on:** SRV-57. **Dashboard only.** Built after SRV-59 (README),
  reusing its `CodeInput` and `useCooldown` (`startNow`: the code was just
  sent).
- **Deviations (as built):** the e2e mail hooks came with SRV-59. Each forgot test creates its own user: the
  server's forgot limiter (5 per IP + email) outlives `resetData()`.

## Deliverables

1. `webdashboard/src/auth/ForgotPasswordPage.jsx`,
   `webdashboard/src/auth/ResetPasswordPage.jsx`; routes `/forgot-password`
   and `/reset-password` (public, like `/sign-in`) in
   `src/shell/routes.jsx`.
2. `SignInPage.jsx`: "Forgot password?" link under the password field.
3. `src/auth/session.js`: `requestCode(email)`, `resetPassword(email,
   code, next)` as plain async calls (no React Query mutation: passwords
   and codes never enter the cache).
4. Strings in `src/strings.js`; `invalid_code`, `mail_failed`,
   `too_many_attempts` in `src/api/errors.js` and DP §7.
5. e2e `e2e/forgot.spec.js`; the e2e server (`e2e/server.mjs`) runs the
   memory mailer and exposes the last code per email to specs (an e2e-only
   route on the e2e server, never in the app).
6. Docs: DP §5.1 (the two pages, wireframes), §3 URLs.

## Spec

- **Forgot page:** title "Forgot password", lead "Enter your email.
  We'll send you a 6-character code.", email field (prefilled from the
  sign-in form if typed there, passed in router state), "Send code",
  "Back to sign in". On 200 → `/reset-password` with `{email}` in router
  **state** (never the URL). 429 → the rate-limit message.
- **Reset page:** without an email in state (a reload, a pasted URL) →
  redirect to `/forgot-password`. Shows "We sent a code to {email} if it
  belongs to an account. It's valid for 30 minutes." Fields, in this
  order: **New password** (rule: at least 10 characters), **Repeat new
  password**, **Code from your email** (6 characters,
  `autoComplete="one-time-code"`, upper-cased as typed, monospace). Under
  the code: "Nothing yet? Check your spam folder." / after a resend "Sent
  again…", and "Resend code" (calls forgot again; disabled for 60 s from
  arriving and after each send, with the countdown). Buttons: "Set
  password", "Use a different email" (back with the email).
- **Errors:** `invalid_code` → on the Code field ("The code is wrong or
  has expired. Request a new one."); `weak_password` → New password;
  others in the form alert.
- **Success:** the form is replaced by a success alert "Password changed.
  Taking you to sign in…" and a "Sign in now" button; after **3 s**
  navigate to `/sign-in` (timer cleared on unmount). The fields are
  cleared.
- Same card layout as sign-in (`auth.module.css`), all three widths.

## Acceptance criteria

- [x] `forgot.spec.js` › "forgot then reset, then sign in with the new
      password" at 390 / 820 / 1440 (the field order checked; code read
      from the e2e mailer, typed in lower case); screenshots `forgot`,
      `reset`, `reset-done`. The same test checks that the email, the code
      and the password are never in a URL or browser storage.
- [x] › "a wrong code shows on the Code field; a short password on New
      password" (and the old password still works); screenshot
      `reset-wrong-code`.
- [x] › "success returns to sign-in after 3 seconds" (Sign in now shown;
      at least 2.9 s).
- [x] › "the reset page without an email goes to forgot".
- [x] › "an unknown email looks the same and mails nothing" (and "Use a
      different email" carries the address back).
- [x] › "resend waits 60 seconds, then sends the same code" (Playwright's
      clock).
- [x] The code input's upper-casing is covered by
      `src/auth/CodeField.test.jsx` (SRV-59), so there's no separate
      `ResetPasswordPage.test.jsx`.
- [x] Screenshots looked at, all three widths: `forgot`, `reset`,
      `reset-wrong-code`, `reset-done`, and `sign-in` / `sign-in-error`
      with the new link.
