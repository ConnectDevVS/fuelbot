# Users, sessions, RBAC & audit — story set (Milestone S2)

Who can sign in to the dashboard, what each role may do, and a record of
every change. No catalog admin yet (S3); this set builds the gate every
admin route will pass through.

- Plan: [server-plan.md](../../plans/server-plan.md) §4.1 (`User`,
  `AuditEntry`), §4.4 (auth & users, user rules), §4.6 (sessions), §4.7
  (roles, platform-only data, prices), §4.11, §6 S2, §7 contract test 5.
- Conventions: [server/CLAUDE.md](../../../CLAUDE.md).

## Execution order

| # | Story | Depends on | Produces |
|---|-------|-----------|----------|
| 06 | Users & passwords | S1 | `User`, `AuditEntry` models; `auth/passwords.js` (bcrypt, length rules); `npm run create-admin` |
| 07 | Sessions | 06 | `POST /api/v1/auth/login`, `logout`, `GET /auth/me`, `POST /auth/password`; JWT cookie (48 h fixed); CSRF header; login rate limit; `password_change_required` gate; `helmet` |
| 08 | RBAC & users API | 07 | `auth/rbac.js` (role → permissions table, `can()`, route guard, machine scoping); `services/views.js` (user view); `/api/v1/users` with the user rules |
| 09 | Audit & sign-off | 08 | `services/audit.js`, login/user/password events, `GET /api/v1/audit` (platform only, filters, cursor pages); RBAC table test; SIGNOFF |

## Definition of Done (every story)

`cd server && npm test` → all pass. One commit per story (`SRV-NN: <title>`),
chained with `&&` after the checks. No app changes in this set.

## Decisions

Product owner (2026-09-27, plan decision log): tenant_admins manage their
tenant's tenant_admins too; users are disabled, never deleted; sessions are
48 hours, fixed.

Made while writing this set:

1. **Permission names, not role checks, in routes.** Routes ask
   `can(user, 'menu:edit', {tenantId, machineId})`; only `auth/rbac.js` knows
   which roles hold which permission. A future `platform_viewer` is one row.
2. **404 vs 403:** a tenant, machine or user outside the caller's scope is
   **404 `not_found`**; inside the scope but without the permission is
   **403 `forbidden`**.
3. **Login failures all look alike:** unknown email, wrong password and
   disabled account are one **401 `invalid_credentials`**, and a bcrypt
   comparison runs even for an unknown email (no timing hint). Failed
   attempts are rate-limited per IP + email (`LOGIN_RATE_LIMIT` per 15 min,
   then **429 `too_many_attempts`**); successful ones don't count.
4. **Every session failure is 401 `not_signed_in`** (no cookie, bad
   signature, expired, disabled user, old `token_version`). A tenant user of
   a disabled tenant gets 403 `tenant_disabled`.
5. **Changing your own password** keeps *this* session (a fresh cookie with
   the new `token_version`) and ends all others.
6. **Passwords:** 10 to 72 bytes (bcrypt ignores anything past 72). Cost
   `BCRYPT_COST` (12; tests use 4).
7. **CSRF:** every non-GET `/api/v1` request, login included, needs
   `X-Requested-With: fuelbot-dashboard` (403 `csrf_header_required`).
8. **Audit** records user creates/updates, password sets and changes,
   logins (success and failure) and, from S3 on, every catalog write. It
   never stores a password or hash. A failed login stores the email as
   typed, with no user id.
9. **`create-admin`** makes a `platform_admin`: `--email` and `--name`
   arguments, the password from a hidden prompt (or `ADMIN_PASSWORD` in the
   environment, for scripts). It refuses an email that exists. It doesn't set
   `must_change_password`, because the admin chose the password.
10. **Cursor pages** (`/users`, `/audit`): newest first by `_id`, `limit` ≤
    200 (default 50), `next_cursor` opaque (base64 of the last id).
