# SRV-59: Dashboard: code at first sign-in, Users page

**As** a new user, **I want** the change-password page to ask for the
code from my email and to send me a new one if it expired. **As** an
admin, **I want** to know whether the code mail went out and to resend it.

- **Refs:** README decisions (product owner 4, 5; planning 4–6, 9);
  DP §5.1, §5.12, §7.
- **Depends on:** SRV-56. **Dashboard only.** Built **before SRV-58**: it
  fixes the forced-change e2e that SRV-56 broke, so every dashboard commit
  passes the full e2e gate.
- **Deviations (as built):** "Send code" has **no confirm** (it only sends
  an email, the same code while it's valid; `useConfirm` is for
  destructive actions with a red button). The code input, `cleanCode()`
  and `useCooldown()` live in `src/auth/CodeField.jsx` for SRV-58 to
  reuse.

## Deliverables

1. `src/auth/ChangePasswordPage.jsx`: a Code field and "Email me a code"
   when forced; `changePassword()` in `session.js` takes `code`.
2. `src/pages/users/UsersPage.jsx` (and its dialogs): mail result after
   create and reset; "Send code" row action.
3. Strings; DP §5.1 and §5.12 updated (wireframes).
4. e2e: the existing forced-change and users specs updated; new cases in
   `e2e/first-signin.spec.js`. The e2e server (`e2e/server.mjs`) gains
   mail hooks (`GET /__e2e/mail?to=`, `POST /__e2e/mail?fail=`,
   `POST /__e2e/expire?email=`) with fixtures `lastCode()`, `mailCount()`,
   `mailFails()`, `expireCode()`.

## Spec

- **Forced change page:** lead becomes "Enter the temporary password from
  your admin and the code we emailed you, then choose your own password."
  Fields: Temporary password, **Code** (as on the reset page), New
  password, Repeat. Under the Code field: "Email me a code" (calls
  `POST /auth/code`; on 200 "Code sent to {email}. Valid until {time}.";
  502 → "We couldn't send the email. Try again or ask your admin.";
  disabled 60 s after each send). `invalid_code` → on the Code field.
  The voluntary change page is unchanged.
- **Users page:**
  - After create: `code_mail: 'sent'` → toast "{name} added. We emailed
    them a code; give them the temporary password yourself."; `failed` →
    a warning dialog "The code email didn't go out" ("{name} needs the code
    from it…") with "Send code" and "Close".
  - After reset: the reset-done toast mentions the emailed code; `failed`
    → the same warning.
  - Row action **"Send code"** (the page needs `users:manage`; hidden for
    yourself and for disabled users) → toast "Code sent to {email}. Valid
    until {HH:MM IST}."; an error (502 `mail_failed`, 409
    `user_disabled`) shows in the page's alert, never toast-only. In the
    row menu after "Reset password" (the same menu on phone cards).
  - The create dialog's temporary-password note: "Give this to the user
    outside the dashboard. We'll also email them a code they need to
    choose their own password."

## Acceptance criteria

- [x] `first-signin.spec.js` › "a new user signs in with the temporary
      password and the emailed code" at 390 / 820 / 1440 (the owner
      creates the user through the API; the welcome code from the e2e
      mailer).
- [x] › "an expired code: Email me a code, then finish" (the e2e server
      expires the welcome code; a new one is mailed and works).
- [x] › "a wrong code shows on the Code field".
- [x] `session.spec.js` › "temporary password forces the change" (Email
      me a code, the status line, "Send again in N s" disabled and muted,
      a lower-case code upper-cased) and "no secrets in storage or URLs"
      (the code added to the secrets).
- [x] `users.spec.js` › "owner creates an operator…" (the code-mail toast,
      one mail); "a failed code mail shows the warning, and Send code
      retries it" (the error in the page's alert while mail still fails);
      "Send code from the row menu; never for yourself or a disabled
      user". Roles without `users:manage` have no Users page at all
      ("operators and viewers have no Users page").
- [x] `src/auth/CodeField.test.jsx` › "upper-cases, drops anything but
      letters and digits, and keeps 6"; "passes the cleaned value to the
      form". `src/api/errors.test.js` covers the four new codes.
- [x] Screenshots looked at, all three widths: `change-password-code-sent`
      (the disabled link was still green and is now muted; the spec waits
      for antd's colour transition), `first-signin-filled`,
      `first-signin-wrong-code` (the link sat on the next label in the
      error state; now spaced), `users-mail-failed`, `users-create`.
