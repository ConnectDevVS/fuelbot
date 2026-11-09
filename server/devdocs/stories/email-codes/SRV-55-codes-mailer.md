# SRV-55: Codes and mail: model, encryption, mailer

**As** the backend, **I want** to issue, check and email short-lived
codes safely, **so that** the password flows in SRV-56 and SRV-57 can
rely on one tested piece.

- **Refs:** README decisions (product owner 1–3, 7, 8, 10; planning 1–3,
  9, 11, 12, 14), README "Design".
- **Depends on:** S2. **Server only.** No route changes yet.

## Deliverables

1. `server/src/models/User.js`: `email_code` (strict sub-schema,
   `select: false`, default null).
2. `server/src/services/codes.js`: `generateCode()`, `issueCode()`,
   `checkCode()`, `clearCode()`; AES-256-GCM helpers.
3. `server/src/services/mail.js`: `createMailer(settings)` →
   `{send({to, subject, text, html})}` with `smtp` (nodemailer),
   `file` and `memory` transports; `codeMail({code, expiresAt, purpose,
   settings})` builds the message (purposes: `welcome`, `reset_by_admin`,
   `forgot`, `requested`).
4. `server/src/settings.js`: `CODE_ENCRYPTION_KEY`, `MAIL_TRANSPORT`,
   `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`,
   `MAIL_DIR`. `createApp({settings})` builds the mailer (or takes one,
   for tests).
5. `server/package.json`: `nodemailer`. `server/.gitignore`: `.mail/`.
6. `test/helpers.js`: test settings use `memory`; `ctx.mail.sent` (the
   array) and `ctx.mail.lastCodeFor(email)` (parses the code from the
   text part) for later stories.
7. Docs: SP §4.16 (the README design), §4.1 User row, §4.11 ("never log
   codes or SMTP credentials"), §4.12 settings; `.env.example`;
   `server/README.md`; `server/CLAUDE.md` never-log list gains codes.

## Spec

- **Settings checks at boot** (throw, like `JWT_SECRET`):
  - production without `CODE_ENCRYPTION_KEY`, or a key that isn't 32
    bytes of base64;
  - production with `MAIL_TRANSPORT` other than `smtp`;
  - `smtp` without `SMTP_USER`, `SMTP_PASS` or `MAIL_FROM`.
  Dev defaults: random key per process, `file` transport, `MAIL_DIR`
  `server/.mail/`.
- **Code:** 6 symbols from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` via
  `crypto.randomInt`. Input normalised with `trim().toUpperCase()`;
  anything not 6 symbols of the alphabet is simply wrong (counts as an
  attempt only if a live code exists).
- **`issueCode`**: one `findOneAndUpdate` keyed on the current
  `email_code.issued_at` (or its absence), so of two parallel calls one
  writes and the other re-reads and reuses. Live = `expires_at > now` and
  `attempts < 5`.
- **`checkCode`**: wrong → `$inc attempts`; when it reaches 5, `$unset`
  the code in the same update (`findOneAndUpdate` with a pipeline or a
  second conditional update). Returns nothing on success; the caller
  clears the code in the same save as the password.
- **Mailer:** never logs the message or the address; on failure it
  throws `MailError` with nodemailer's code only (`EAUTH`, `ETIMEDOUT`…).
  `smtp` uses `secure: true` on 465, a 10 s connection and 15 s send
  timeout.
- **Message:** subject `Your FuelBot code: <code>`; text and HTML parts
  with the code in large monospace, "valid for 30 minutes (until HH:MM)"
  in `DISPLAY_TZ`, the purpose line, the dashboard URL, and "If you
  didn't ask for this, you can ignore this email."

## Acceptance criteria

- [ ] `codes.test.js` › "codes use the alphabet and are 6 long" (1000
      draws).
- [ ] › "a live code is reused with its expiry": two `issueCode` calls
      → same code, same `expires_at`, `reused: true` the second time.
- [ ] › "an expired code is replaced" (clock moved 31 min).
- [ ] › "parallel issues give one code" (`Promise.all` of 5).
- [ ] › "the stored code is encrypted": the raw document holds no code
      text; a different key can't decrypt it.
- [ ] › "check accepts lower case and spaces"; "rejects expired";
      "rejects with no code".
- [ ] › "five wrong attempts void the code": the fifth wrong clears it;
      the right code afterwards → `invalid_code`.
- [ ] `settings.test.js` › the boot checks above, one case each.
- [ ] `mail.test.js` › "file transport writes an .eml"; "memory
      transport collects"; "the code mail has both parts, the code, the
      expiry in the display zone and the dashboard URL"; "send failure
      throws MailError without the address or body".
- [ ] `logging.test.js` (or the existing log-scrub test) › "no code in
      request logs".
