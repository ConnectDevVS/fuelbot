# SRV-46: Users and Company

**As a** tenant admin, **I want** to add people with a temporary password,
set their role and machines, reset passwords and disable accounts, and
edit my company's kiosk branding. **As** staff, I do this for any tenant
and for FuelBot staff. **So that** each company runs its own team.

- **Refs:**
  - product owner: temporary passwords changed at first sign-in; disabled,
    never deleted; tenant_admins manage their tenant's users including
    other tenant_admins;
  - SP §4.4 (users API, user rules), §4.7;
  - users-rbac decisions 5, 6, 10;
  - DP §5.12, §5.13 (+ wireframe), §7 (users codes);
  - captured: `weak_password` with string `details`, `invalid_email`.
- **Depends on:** SRV-35.

## Deliverables

1. `src/pages/users/UsersPage.jsx`:
   - `/t/:tid/users` (tenant_admin + staff);
   - `/users` (staff, all, with a tenant filter).
2. `src/pages/users/UserDialog.jsx` (create/edit), `TempPasswordField.jsx`.
3. `src/lib/tempPassword.js`: 14 characters from the key alphabet
   (`ABCDEFGHJKMNPQRSTUVWXYZ23456789` + lowercase without l/o), generated
   with `crypto.getRandomValues`.
4. `src/pages/company/CompanyPage.jsx` (`/t/:tid/company`).

## Spec

- **List:**
  - `GET /users?limit=50[&tenant=]` + cursor;
  - columns per DP §5.12;
  - `machines` → names ("All machines" when empty);
  - "Must change password" when `must_change_password`.
- **Create:**
  - `POST /users {email, name, role, tenant_id?, machines?, password}`;
  - roles offered: tenant_admin, operator, viewer; staff also
    platform_admin (with no tenant);
  - tenant: a tenant user's own; staff pick one;
  - the machines multi-select appears only for operator/viewer;
  - temporary password: typed or **Generate**; shown with Copy and the
    note (DP §5.12). It's never stored anywhere and cleared when the dialog
    closes.
- **Edit:** `PATCH /users/:id {name, role, machines}`.
  - The role select excludes crossing platform ↔ tenant (the server says
    `role_scope_change`).
  - Your own row hides the role and Disable (`forbidden_self`).
- **Disable/Enable:** `PATCH {disabled}`, after a confirm (DP §4.9). 409
  `last_tenant_admin` / `last_platform_admin` → a message.
- **Reset password:** `POST /users/:id/password {password}` with the same
  temporary-password field.
- **Errors → fields:** DP §7 (users codes are top-level, via
  `applyServerError`).
- **Company:**
  - `GET /tenants/:tid`; `PATCH /tenants/:tid {name, branding}`;
  - no `If-Match` (tenants aren't versioned);
  - logo text ≤ 4, with a live badge preview; display name ≤ 60; phone
    ≤ 30;
  - `RestartNote`;
  - read-only without `tenant:edit` (only tenant_admin and staff reach it
    via nav; others get NotAvailable).

## Acceptance criteria

- [ ] `src/lib/tempPassword.test.js` › "14 chars, no look-alikes, ≥ 10 so
      the server accepts it".
- [ ] `e2e/users.spec.js` › "owner creates an operator limited to Bay 02,
      and that user must change the password at first sign-in" (a second
      browser context signs in as the new user → the change form).
- [ ] `e2e/users.spec.js` › "duplicate email and a short password show
      field errors" (`email_taken`, `weak_password`).
- [ ] `e2e/users.spec.js` › "owner can't disable themselves or the last
      tenant admin" (the controls are hidden for self; disabling the only
      other admin after demoting → the `last_tenant_admin` message).
- [ ] `e2e/users.spec.js` › "disable signs the user out" (their open
      context's next request → sign-in).
- [ ] `e2e/users.spec.js` › "reset password forces a change".
- [ ] `e2e/users.spec.js` › "staff sees all users with a tenant filter and
      can create a platform_admin"; "tenant_admin can't see globex users
      or offer platform_admin".
- [ ] `e2e/users.spec.js` › "operators and viewers have no Users page"
      (NotAvailable, no request).
- [ ] `e2e/company.spec.js` › "owner changes logo text; the config preview
      header shows it"; "logo text > 4 characters → field error".
- [ ] Screenshots: users list, create (with generated password), edit,
      Company, 3 sizes × 2 themes. Looked at.

## Out of scope

Email invites and self-service reset (SP §8), deleting users (never), and
the `platform_viewer` role (later).
