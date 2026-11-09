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
5. `webdashboard/e2e/leak-scan.spec.js`: `status` is allowed in
   `/tenants/:tid/complaints…` responses only (a complaint's status is
   tenant data; a machine's stays platform-only). Without this the scan
   fails as soon as Complaints is in the tenant nav.
6. `webdashboard/e2e/seed.mjs`: complaints for desk, ops, look, owner
   (powerfuel) and boss (globex), in all three statuses, with staff and
   tenant comments. **Avoid** the words the leak scan looks for
   ("maintenance", fault codes, IPs) in seed text.
7. **Found by the gate:** with Complaints, staff's phone More sheet (in a
   tenant) grew taller than the screen and pushed its title and Close off
   the top. `src/shell/MoreSheet.jsx` now caps it at 92 % like every sheet,
   and its list scrolls (`e2e/shell.spec.js` checks the longest sheet).
   `e2e/shell.spec.js`'s nav lists gain Complaints / All complaints.
8. `webdashboard/e2e/complaints.spec.js`; `ComplaintStatusChip` on
   `/_gallery`.

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
- **Empty states** name the filter: "No open complaints." / "No closed
  complaints." / "No complaints yet." (as built: no second Raise button in
  the empty state; the header's is the only one).
- **Raise** (`complaints:raise`): a button in the page header opens a
  sheet (from the bottom on a phone, from the right elsewhere; the `Sheet`
  wrapper): Title (counter 120), Description
  (textarea, counter 4000), Submit / Cancel. On 201 → navigate to the new
  complaint's page and show "Complaint #N raised" (the page itself is
  SRV-53; until then the route shows its placeholder). Field errors from
  `details[]` (DP §7). Closing with text typed asks first ("Discard this
  complaint?", `confirm.discardComplaint`).
- **Staff** never see the Raise button (no permission).
- Text is rendered as text (React escaping); titles ellipsize in the
  table, full title in a tooltip.

## Acceptance criteria

- [x] `complaints.spec.js` › "viewer raises a complaint and sees it in
      their list" (look): dialog, submit, lands on #N, back to list shows
      it Open.
- [x] › "operator sees only their own" (desk): ops' complaints absent.
- [x] › "tenant admin sees everyone's with Raised by" (owner).
- [x] › "staff all-tenants list with tenant filter" (staff): both
      tenants; `?tenant=globex` only globex; no Raise button.
- [x] › "status filter is in the URL": Closed shows only closed; reload
      keeps it.
- [x] › "raise validation": empty title → field error; server 400 mapped
      to the field.
- [x] Unit: `src/ui/ComplaintStatusChip.test.jsx` labels for the three
      statuses; `src/shell/routes.test.js` nav per role (Complaints for all
      four; the platform group item for staff only).
- [x] › "closing with text typed asks before discarding".
- [x] Screenshots looked at: `complaints-list` (owner, staff),
      `complaints-raise` (look), at 390 / 820 / 1440.
