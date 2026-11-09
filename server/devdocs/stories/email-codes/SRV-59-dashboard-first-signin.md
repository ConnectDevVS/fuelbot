# SRV-59: Dashboard: code at first sign-in, Users page

**As** a new user, **I want** the change-password page to ask for the
code from my email and to send me a new one if it expired. **As** an
admin, **I want** to know whether the code mail went out and to resend it.

- **Refs:** README decisions (product owner 4, 5; planning 4–6, 9);
  DP §5.1, §5.12, §7.
- **Depends on:** SRV-56. **Dashboard only.**

## Deliverables

1. `src/auth/ChangePasswordPage.jsx`: a Code field and "Email me a code"
   when forced; `changePassword()` in `session.js` takes `code`.
2. `src/pages/users/UsersPage.jsx` (and its dialogs): mail result after
   create and reset; "Send code" row action.
3. Strings; DP §5.1 and §5.12 updated (wireframes).
4. e2e: the existing forced-change and users specs updated; new cases in
   `e2e/first-signin.spec.js`.

## Spec

- **Forced change page:** lead becomes "Choose your own password. Enter
  the temporary password from your admin and the code we emailed you."
  Fields: Temporary password, **Code** (as on the reset page), New
  password, Repeat. Under the Code field: "Email me a code" (calls
  `POST /auth/code`; on 200 "Code sent to {email}. Valid until {time}.";
  502 → "We couldn't send the email. Try again or ask your admin.";
  disabled 60 s after each send). `invalid_code` → on the Code field.
  The voluntary change page is unchanged.
- **Users page:**
  - After create: `code_mail: 'sent'` → toast "{name} added. We emailed
    them a code; give them the temporary password yourself."; `failed` →
    a warning dialog "User added, but the code email didn't go out" with
    "Send code" and "Close".
  - After reset: the reset-done toast mentions the emailed code; `failed`
    → the same warning.
  - Row action **"Send code"** (only with `users:manage`, hidden for
    yourself and for disabled users) → confirm "Email a code to
    {email}?" → toast "Code sent. Valid until {time}." / error toast on
    502. In the row menu next to "Reset password", and in the phone
    card's actions.
  - The create dialog says under the temporary-password field: "We'll
    also email them a code they need to set their own password."

## Acceptance criteria

- [ ] `first-signin.spec.js` › "a new user signs in with the temporary
      password and the emailed code" at 390 / 820 / 1440 (admin creates
      the user in the same spec; code from the e2e mailer).
- [ ] › "an expired code: Email me a code, then finish" (the e2e server
      ages the code; or a fresh user whose code was voided by 5 wrong
      tries).
- [ ] › "wrong code shows on the Code field".
- [ ] `users.spec.js` › "create shows the code-mail toast"; "a failed
      mail shows the warning with Send code" (e2e mailer set to fail);
      "Send code from the row menu"; "Send code hidden for self and
      disabled users and for roles without users:manage".
- [ ] The existing forced-change e2e passes with the code added.
- [ ] Screenshots of the forced page, the warning dialog and the row menu
      at all three widths, looked at.
