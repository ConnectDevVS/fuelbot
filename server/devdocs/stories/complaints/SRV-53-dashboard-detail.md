# SRV-53: Dashboard: complaint page

**As a** tenant user, **I want** to read the whole thread of my complaint,
comment, and reopen it when it's closed. **As** FuelBot staff, **I want**
to comment and change its status with a reason, in one step.

- **Refs:** DP §5.20; README decisions (product owner 2–4; planning 4–6,
  9, 12).
- **Depends on:** SRV-51, SRV-52. **Dashboard.**

## Deliverables

1. `webdashboard/src/pages/complaints/ComplaintPage.jsx`,
   `ComplaintTimeline.jsx`, `ComplaintReply.jsx` (the comment box with the
   staff status select and the tenant Reopen), `complaint.module.css`.
2. Route `/t/:tid/complaints/:number` (staff reach it from either list).
3. Strings and error mapping.
4. `webdashboard/e2e/complaints.spec.js` (more tests). The e2e seed sets
   each complaint's `created_at` (it defaulted to the seed's run time, so
   a description read as newer than the answers under it).

## Spec

- **Header:** `#N` · title · status chip · "Raised by <name> · <date>"
  (staff: + email and tenant name) · "All complaints" back: the browser's
  back when the user came from the list (its filter kept), else the
  tenant's list.
- **Description** first, as the thread's opening entry (`white-space:
  pre-wrap`).
- **Timeline**, oldest first: a comment shows author, time, text; a
  status change shows "<author> changed status Open → With service" with
  its text. FuelBot authors carry a **FuelBot support** tag (tenant view:
  "FuelBot support · <name>", no email).
- **Comment box** (`complaints:comment`): textarea (counter 2000) + Post.
  Below it, for staff only: "Tenant users see everything you write here."
  On 201 the page shows the returned complaint (no refetch flicker); the
  box clears.
- **Staff status control** (`complaints:status`): a "Change status"
  select next to Post, showing the other two statuses. Choosing one
  turns the button into **"Post and set to <status>"**, and the textarea
  becomes required ("Add a comment to change the status"). Sends
  `POST …/status {from: <shown status>, to, text}`.
- **Reopen** (`complaints:reopen`, only when `closed`): a "Reopen"
  button; it opens the same textarea required, button "Post and reopen".
- **409 `status_changed`:** an inline alert "This complaint was updated
  by someone else" + reload; the typed text is kept.
- **409 `complaint_full`:** "This thread is full. Raise a new complaint
  and mention #N."
- **404:** the standard Not found page (an operator opening a colleague's
  number).
- A closed complaint keeps the comment box (comments allowed; decision 5).

## Acceptance criteria

- [x] `complaints.spec.js` › "creator comments on their complaint" (desk).
- [x] › "staff move a complaint to With service with a comment": the
      button needs text; after posting, chip and timeline show it; the
      tenant (owner) then sees "FuelBot support · Staff" and no staff
      email on the page.
- [x] › "staff can't change status without a comment": the button is
      disabled with empty text; no request is sent.
- [x] › "tenant admin reopens a colleague's closed complaint" (owner on
      look's #3, the seed's closed one): Reopen → required comment →
      status Open.
- [x] › "operator can't open a colleague's complaint": desk at ops'
      number → Not found.
- [x] › "viewer has no status control, only Reopen when closed" (look).
- [x] › "stale status shows the conflict alert": two staff pages, both
      change from Open; the second sees the alert and keeps its text.
- [x] › "text renders as text": a seeded title and comment containing
      `<b>x</b>` show literally.
- [x] Screenshots looked at: `complaint-tenant` (desk), `complaint-closed`
      (look), `complaint-staff` (status chosen; shot after antd's colour
      fade ends), at 390 / 820 / 1440.
