# SRV-52: Dashboard: complaints list and raise

**As a** tenant user, **I want** a Complaints page where I raise a
complaint and see mine with their status, **so that** I know what's
happening without calling. **As** FuelBot staff, **I want** every
tenant's open complaints in one list.

- **Refs:** DP §5.20, §3.1, §3.3, §6, §7; README decisions.
- **Depends on:** SRV-50. **Dashboard** (+ the e2e seed).

## Deliverables

1. `webdashboard/src/pages/complaints/ComplaintsPage.jsx` (tenant and
   staff "all tenants" modes), `RaiseComplaintDialog.jsx`,
   `StatusChip` in `src/ui/Chips.jsx` (Open / With service / Closed).
2. `src/shell/pages.js`: a **Complaints** nav item for everyone who holds
   `complaints:comment`; for staff, a platform-group item to
   `/complaints` (all tenants) and the tenant item inside a tenant.
3. Routes: `/t/:tid/complaints`, `/complaints` (staff).
4. `src/strings.js` keys; `src/api/errors.js`: `status_changed`,
   `status_unchanged`, `complaint_full`, `invalid_status`.
5. `webdashboard/e2e/seed.mjs`: complaints for desk, ops, look, owner
   (powerfuel) and boss (globex), in all three statuses, with staff and
   tenant comments. **Avoid** the words the leak scan looks for
   ("maintenance", fault codes, IPs) in seed text.
6. `webdashboard/e2e/complaints.spec.js`.

## Spec

- **Table** (desktop / tablet), cards on phone (the `DataTable` pattern):
  `#` · Title · Status chip · Raised by (tenant_admin and staff only) ·
  Last activity (relative + date tooltip) · Comments count. Staff's
  all-tenants list adds Tenant first. A row opens the complaint page
  (SRV-53).
- **Filter:** status segmented control *Open & with service* (default) /
  *Closed* / *All*, kept in the URL (`?status=`); staff also the tenant
  select (`?tenant=`). Load more (cursor). Refresh button + Updated time
  (DP §2.6).
- **Empty states:** "No complaints yet" + Raise button (tenant); "Nothing
  open" (staff, default filter).
- **Raise** (`complaints:raise`): a button in the page header opens a
  dialog (a full-screen sheet on phone): Title (counter 120), Description
  (textarea, counter 4000), Submit / Cancel. On 201 → navigate to the new
  complaint's page and show "Complaint #N raised". Field errors from
  `details[]` (DP §7). Unsaved-text guard on close, like other forms.
- **Staff** never see the Raise button (no permission).
- Text is rendered as text (React escaping); titles ellipsize in the
  table, full title in a tooltip.

## Acceptance criteria

- [ ] `complaints.spec.js` › "viewer raises a complaint and sees it in
      their list" (look): dialog, submit, lands on #N, back to list shows
      it Open.
- [ ] › "operator sees only their own" (desk): ops' complaints absent.
- [ ] › "tenant admin sees everyone's with Raised by" (owner).
- [ ] › "staff all-tenants list with tenant filter" (staff): both
      tenants; `?tenant=globex` only globex; no Raise button.
- [ ] › "status filter is in the URL": Closed shows only closed; reload
      keeps it.
- [ ] › "raise validation": empty title → field error; server 400 mapped
      to the field.
- [ ] Unit: `StatusChip.test.jsx` labels for the three statuses;
      `pages.test.js` nav per role (Complaints for all four; platform group
      item for staff only).
- [ ] Screenshots looked at: `complaints-list` (owner, staff),
      `complaints-raise` (look), at 390 / 820 / 1440.
