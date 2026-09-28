# SRV-28: `/auth/me` for the dashboard

**As** the dashboard, **I want** to know exactly what the signed-in user may
do, which tenant they belong to, the display time zone and when their
session ends, **so that** I show only usable controls without copying the
server's role table.

- **Refs:** SP §4.4 (auth), §4.6 (sessions), §4.7 (roles; "the dashboard
  only hides"); DP §2.5, §2.7, §6.
- **Depends on:** S2 (merged). **Server only.**

## Deliverables

1. `server/src/auth/rbac.js`: `effectivePermissions(user)`, a sorted array.
2. `server/src/routes/auth.js`: `GET /auth/me` returns the new fields; so
   does `POST /auth/password`'s response. `POST /auth/login` stays
   `{user}`, and the dashboard calls `/auth/me` next.
3. `server/test/auth.test.js`, `server/test/rbac.test.js`: tests.
4. Docs: SP §4.4 table row for `GET /auth/me`.

## Spec

`GET /api/v1/auth/me` → 200:

```json
{"user": {…userView, unchanged…},
 "permissions": ["catalog:read", "machines:read", "menu:edit", "sales:read", "tenant:read"],
 "all_machines": false,
 "tenant": {"id": "powerfuel", "name": "PowerFuel Gym", "logo_text": "PF"},
 "display_tz": "Asia/Kolkata",
 "session_expires_at": "2026-09-30T07:12:03Z"}
```

- **`permissions`:** `[...ROLE_PERMISSIONS[role]]`, minus every permission
  in `NEEDS_ALL_MACHINES` when `!hasAllMachines(user)`, sorted. It's built
  from the same table `can()` uses, so nothing is duplicated.
- **`all_machines`:** `hasAllMachines(user)`.
- **`tenant`:** for tenant users, `{id, name, logo_text}` from `Tenant`
  (`branding.logo_text ?? null`); `null` for `platform_admin`. This is
  member-visible data (they can already `GET /tenants/:tid`).
- **`display_tz`:** `settings.displayTz`.
- **`session_expires_at`:** `req.session.exp` (JWT `exp`, seconds) as ISO
  UTC without milliseconds.
- **Unchanged:**
  - still allowed while `must_change_password` (the `WHILE_CHANGING` list);
  - a disabled tenant still gets 403 `tenant_disabled` from
    `requireSession`.
- **`POST /auth/password`** responds with the same shape: a new cookie, so
  a new `session_expires_at`.

## Acceptance criteria

- [ ] `rbac.test.js` › "effectivePermissions equals the role table": for
      each role the result equals `ROLE_PERMISSIONS[role]` (sorted), except
      a limited operator lacks `products:edit`; a limited viewer is
      unchanged.
- [ ] `auth.test.js` › "/auth/me returns permissions, tenant, tz, expiry":
      - platform: `tenant: null` and the platform-only permissions;
      - tenant_admin: `tenant.name` "PowerFuel Gym", `logo_text` "PF",
        includes `price:write`, `stock:write`, `keys:manage`;
      - operator limited to one machine: `all_machines: false`, no
        `products:edit`, no `price:write`;
      - viewer: exactly `catalog:read, machines:read, sales:read, tenant:read`.
- [ ] `auth.test.js` › "no tenant user ever gets a platform-only permission":
      for tenant_admin, operator and viewer, `permissions` ∩ `PLATFORM_ONLY`
      = ∅ (export `PLATFORM_ONLY` from `rbac.js` for this).
- [ ] `auth.test.js` › "session_expires_at is 48 h after sign-in" (± 5 s),
      with no milliseconds; after `POST /auth/password` it's later than
      before.
- [ ] `auth.test.js` › "/auth/me works while a password change is
      required": 200 with `user.must_change_password: true`.
- [ ] The RBAC table row `GET /api/v1/auth/me` still passes (200 ×4).
- [ ] `cd server && npm test` passes.

## Out of scope

Per-machine permission lists (the UI uses `user.machines` +
`all_machines`), and sliding sessions (product owner: 48 h fixed).
