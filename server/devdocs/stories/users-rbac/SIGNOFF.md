# Users, sessions, RBAC & audit — sign-off (Milestone S2)

**Date:** 2026-09-27. **Branch:** `server-backend`. **Result: PASS.**

## Automated (`cd server && npm test`: 81 / 81)

| Area | Covered |
|---|---|
| Passwords | 10 chars to 72 bytes; bcrypt; a comparison even for unknown emails |
| `User` model | tenant roles need a tenant; platform_admin has none; tenant_admin has all machines; unique lowercase email; hash never selected by default |
| `create-admin` | creates a platform_admin (env password), refuses an existing email, a weak password, and a missing password without a terminal; never prints the password |
| Sessions | 48 h httpOnly SameSite=Strict cookie (JWT `exp − iat` = 48 h); identical 401 for every sign-in failure; CSRF header; rate limit per IP + email (successes don't count); forged / expired / `alg: none` tokens refused; disabling or `token_version` ends sessions; disabled tenant locks its users out; the temporary-password gate; own password change keeps this session, ends others; sign-out |
| RBAC | platform-only permissions in no tenant role; prices tenant_admin+; 404 outside scope vs 403 inside; product edits need every machine; record scope filters |
| Users API | scopes per role; tenant_admin creates tenant_admins in their tenant but nothing platform or elsewhere; no self role change / disable / reset; last tenant_admin kept; disable ends sessions, re-enable restores, no delete; role/machine rules; `tenant_id` immutable; admin-set password temporary; cursor pages |
| Audit | sign-ins (failures with the typed email, no user); user create / update (changed fields only) / reset; `GET /audit` platform-only with filters; **no password or bcrypt hash in logs or the audit** |
| RBAC table (contract test 5) | `/auth/me`, `/users`, `/audit` × four roles. Rows are added as later routes land |

## Live check

`npm run db`, `ADMIN_PASSWORD=… node scripts/create-admin.js --email=ops@fuelbot.example`,
`npm start`, then `curl`: sign-in set the cookie; `/users` and `/audit`
answered (the audit showed the `auth.login`); a write without the CSRF header
got `csrf_header_required`; the password never appeared in the server log.

## Notes

- The leak test captures the console during a create → sign-in → change →
  reset → failed sign-in flow. Request logging is off in tests; it only ever
  prints method, path and status.
- The last-`platform_admin` guard exists, but nothing in the API can reach it
  today (you can't disable yourself, and roles can't cross platform/tenant).
  It's defence in depth.
