# Email codes — story set (Milestone S11)

Dashboard users get a **6-character code by email** and must enter it to
set a password: when they replace their temporary password at first
sign-in (or after an admin reset), and in a new **forgot password** flow.
Mail goes out through a Gmail account over SMTP. Server and dashboard
only: the kiosk app, bridge and firmware don't change.

This reverses part of SP §8 ("Email (invites, password reset by email)"
out of scope) and the "no email in v1" clause of the 2026-09-26 decision.
Admins still set temporary passwords.

- **Plans:**
  - [server-plan.md](../../plans/server-plan.md) §4.1 (User), §4.4
    (auth & users routes), §4.6 (sessions), §4.11 (logging), §4.12
    (settings), §8, §0 (a 2026-11-09 row). Cited as "SP §n". The design
    below moves into a new **SP §4.16 Email codes** in SRV-55.
  - [dashboard-plan.md](../../../../webdashboard/devdocs/plans/dashboard-plan.md)
    §5.1 (sign-in, change password), §5.12 (users), §7 (error codes).
    Cited as "DP §n".
- **Builds on:** users, RBAC and audit (S2), the dashboard shell, auth
  pages and e2e harness (S7).
- **Conventions:** [server/CLAUDE.md](../../../CLAUDE.md),
  [webdashboard/CLAUDE.md](../../../../webdashboard/CLAUDE.md).

## Goals

1. Someone who learns a temporary password can't take over the account
   without the user's inbox too.
2. A user who forgot their password resets it themselves in a couple of
   minutes, without an admin.
3. An admin can resend a code when a user's mail went missing.
4. No code, password or SMTP secret is ever logged, put in a URL or
   stored readable.

## Execution order

| # | Story | Depends on | Produces |
|---|-------|-----------|----------|
| 55 | [Codes and mail: model, encryption, mailer](SRV-55-codes-mailer.md) | S2 | `User.email_code`, `services/codes.js` (issue / check / clear, AES-GCM), `services/mail.js` (SMTP, file and memory transports), settings, `.env.example`, SP §4.16 |
| 56 | [Codes for new users, admin resets and first sign-in](SRV-56-codes-first-signin.md) | 55 | welcome mail on `POST /users`, mail on `POST /users/:id/password`, `POST /users/:id/code` (admin resend), `POST /auth/code`, `code` required by `POST /auth/password` while `must_change_password`, audit, RBAC rows |
| 57 | [Forgot password API](SRV-57-forgot-api.md) | 55 | `POST /auth/forgot`, `POST /auth/reset` (public, rate-limited, no account enumeration), audit |
| 58 | [Dashboard: forgot and reset pages](SRV-58-dashboard-forgot.md) | 57 | "Forgot password?" on sign-in, `/forgot-password`, `/reset-password` (code, password, repeat; success then sign-in after 3 s), strings, error codes |
| 59 | [Dashboard: code at first sign-in, Users page](SRV-59-dashboard-first-signin.md) | 56 | code field and "Email me a code" on the forced change page; mail result after create/reset; "Send code" row action |
| 60 | [End-to-end, real Gmail check and sign-off](SRV-60-e2e-signoff.md) | all | e2e walk-throughs at three widths, one real mail through Gmail, deployment guide, SIGNOFF.md, SP §0/§6/§8 |

**As built:** SRV-59 ran before SRV-58, so the forced-change e2e that
SRV-56 changed passes again before the next dashboard commit.

## Definition of Done (every story)

- **Server stories (55–57):** `cd server && npm test` passes, with a row
  in the RBAC table test (`server/test/audit.test.js`) for every new
  admin route and every role.
- **Dashboard stories (58–60):** the webdashboard gate
  (`cd server && npm test && cd ../webdashboard && npm run lint && npm test && npm run build && npm run e2e`).
- **Screenshots are looked at** at 390 / 820 / 1440 for every UI story;
  the commit message says so.
- Each acceptance item names its test (file + "it"/test title).
- **Commits:** one per story, `SRV-NN: <title>`, chained with `&&` after
  the checks; stage named files only, never `git add -A`.
- **No test sends real mail.** Tests and e2e use the memory transport;
  only SRV-60's manual check talks to Gmail.

## Decisions

### Product owner (2026-11-09)

1. **The code:** 6 alphanumeric characters, sent by email.
2. **It expires 30 minutes after it's issued** and is **cleared once a
   password is set with it**.
3. **Resending sends the same code** while it's live (it keeps its
   original expiry). Once it has expired (or been used or voided), the
   next request creates a new code that replaces the old one.
4. **New users:** the admin still sets a temporary password (passed on
   outside the system, as today). Creating the user emails a code. The
   forced change page asks for the temporary password, the new password
   (twice) **and the code**.
5. **First sign-in after the code expired:** the forced change page has
   an **"Email me a code"** button (rule 3 applies).
6. **Forgot password:** sign-in → "Forgot password?" → a page with an
   email field → submit sends a code and moves to a page with **new
   password, repeat password and code**. A matching code shows a success
   message and returns to sign-in after **3 seconds**; the code is
   cleared.
7. **Codes are stored encrypted** (so the same code can be resent), with
   a key from the environment.
8. **5 wrong attempts void the code**; the user asks for a new one.
9. **Existing users get no mail at rollout.** They get a code when they
   use forgot password, hit the forced change page, or an admin sends one.
10. **Sender:** a personal `@gmail.com` account (SMTP with an app
    password).

### Made while writing this set (can be revisited)

1. **One code slot per user**, shared by every flow. A code from the
   welcome mail works on the forgot page and vice versa; using it
   anywhere clears it. Simpler than per-purpose codes, and the user only
   ever has one code to look for.
2. **Alphabet:** uppercase `A–Z` and `2–9` without `O`, `I`, `L` (31
   symbols, about 887 million codes), so it can be read off a phone and
   typed. Input is trimmed and upper-cased before comparing.
3. **Encryption:** AES-256-GCM, a fresh 12-byte IV per code, key
   `CODE_ENCRYPTION_KEY` (32 bytes, base64). Required when
   `NODE_ENV=production`; in dev a random key per process (codes die on
   restart, like dev sessions). Comparison after decrypting uses
   `crypto.timingSafeEqual`.
4. **The voluntary password change** (account menu, already signed in
   with their own password) **doesn't ask for a code.** Only the forced
   change and forgot password do.
5. **The admin reset** (`POST /users/:id/password`) also emails a code,
   since the user lands on the forced change page again.
6. **The welcome mail never contains the temporary password.** It has
   the code, the dashboard link, and a line saying their admin gives them
   the temporary password. Mail is not a place for passwords.
7. **No account enumeration:** `POST /auth/forgot` always answers
   `200 {ok: true}`, whether or not the email exists, the user is
   disabled or their tenant is disabled (no mail in those cases). A wrong,
   expired, voided or unknown code is always **400 `invalid_code`**
   ("The code is wrong or has expired. Request a new one.").
8. **Rate limits** (per IP + email, 15-minute window, like sign-in):
   forgot and "Email me a code" 5; reset 10. The attempt counter on the
   code (decision 8) is the real guard; the limiter stops floods and mail
   spam.
9. **Mail is sent inside the request**, after the database write. If
   sending fails, the write stands: `POST /users` still answers 201 with
   `code_mail: 'failed'` (the dashboard warns and offers "Send code");
   the code routes answer **502 `mail_failed`**; forgot still answers 200
   (no enumeration) and logs the failure without the address. A failed
   send never creates a new code: retrying resends the same one.
10. **A successful reset** sets the password, clears
    `must_change_password` and the code, bumps `token_version` (every
    session ends) and **doesn't sign the user in**: they go back to
    sign-in, as decision 6 says.
11. **Transports:** `MAIL_TRANSPORT=smtp | file | memory`. `smtp` is
    required in production; `file` (the dev default) writes each message
    as an `.eml` into `server/.mail/` (gitignored) so a developer can read
    the code without it ever reaching a log; `memory` keeps messages in
    an array for tests and e2e.
12. **Gmail settings:** `SMTP_HOST` (default `smtp.gmail.com`),
    `SMTP_PORT` (465, TLS), `SMTP_USER`, `SMTP_PASS` (a Google **app
    password**; the account needs 2-Step Verification), `MAIL_FROM`
    (must be the Gmail address or a verified alias). `nodemailer` is the
    one new dependency. Personal Gmail allows about 500 mails a day,
    plenty for a handful of admins.
13. **Audit:** `auth.code_sent` (forgot or self-request), `user.code_sent`
    (admin resend, and the mail sent by create/reset is noted on
    `user.create` / `user.password_reset` as `code_mail`),
    `auth.code_failed` (a wrong code; `voided: true` on the fifth),
    `auth.password_reset` (forgot flow). No entry ever holds the code.
14. **Email contents:** plain text plus a simple HTML part, subject
    "Your FuelBot code: ABC234". The body has the code, "valid for 30
    minutes", what it's for, and the dashboard URL (`PUBLIC_URL` +
    `/dashboard/`). No tracking, no images.

## Design (moves into SP §4.16 in SRV-55)

**User field** (`select: false`, strict sub-schema):

```
email_code: {
  enc: String,          // base64(iv | ciphertext | tag)
  expires_at: Date,
  attempts: Number,     // wrong tries so far
  issued_at: Date,
}                        // absent or null = no code
```

**`services/codes.js`:**

- `issueCode(user, settings)` → `{code, reused}`: a live code (not
  expired, `attempts < 5`) is decrypted and returned as is; otherwise a
  new one is generated (`crypto.randomInt`), encrypted and saved with
  `expires_at = now + 30 min`, `attempts = 0`. One atomic update, so two
  parallel requests can't issue two codes.
- `checkCode(user, input, settings)` → `true` or throws 400
  `invalid_code`: no code, expired or wrong → `invalid_code`; wrong adds
  1 to `attempts` atomically and clears the code on the fifth.
- `clearCode(user)`: on a successful password set.

**Routes** (SP §4.4):

| Method & path | Who | What |
|---|---|---|
| `POST /auth/forgot` | anyone | `{email}` → always 200 `{ok: true}`; mails a code to an active user of an active tenant. Rate-limited |
| `POST /auth/reset` | anyone | `{email, code, new}` → 200 `{ok: true}`; 400 `invalid_code` / `weak_password`. Ends every session. Rate-limited |
| `POST /auth/code` | signed in, **only while `must_change_password`** (added to `WHILE_CHANGING`) | mails a code to yourself → 200 `{ok: true, expires_at}`; 502 `mail_failed`. Rate-limited |
| `POST /auth/password` | signed in | adds `code`, **required while `must_change_password`** (400 `invalid_code`), ignored otherwise |
| `POST /users` | `users:manage` | unchanged body; mails the welcome code; the response adds `code_mail: 'sent' \| 'failed'` |
| `POST /users/:id/password` | `users:manage` | unchanged; mails a code; response adds `code_mail` |
| `POST /users/:id/code` | `users:manage` | resend (same code if live) → 200 `{ok: true, expires_at}`; 502 `mail_failed`; 403 `forbidden_self`; 409 `user_disabled` |

`expires_at` tells the dashboard what to say ("valid until 14:32"). The
code itself is never in a response.

## Out of scope

Codes for the kiosk, magic sign-in links, two-factor at every sign-in,
email change by the user, invites without a temporary password, a
"resend" countdown on the server (the dashboard has a 60 s cooldown on
its buttons), mail templates per tenant, bounce handling, and moving off
Gmail (a transactional mail service comes with hosting).
