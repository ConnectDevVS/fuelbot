# SRV-50: Complaints: model, permissions, raise and read

**As a** tenant user, **I want** to raise a complaint and see my
complaints, **so that** FuelBot knows about a problem and I can follow it.
**As** FuelBot staff, **I want** every tenant's complaints in one list,
**so that** nothing is missed.

- **Refs:** SP §4.15, §4.7, §4.4; README decisions (product owner 1, 2, 5;
  planning 1–3, 7–9, 11–13).
- **Depends on:** S2 (users, RBAC, audit). **Server only.**

## Deliverables

1. `server/src/models/Complaint.js` (+ `models/index.js`): the model below.
2. `server/src/models/Tenant.js`: `complaint_seq: {type: Number, default: 0}`.
3. `server/src/auth/rbac.js`: the `complaints:*` permissions, `TENANT_ONLY`,
   and a `complaintScope(user)` query filter.
4. `server/src/services/views.js`: `complaintView.platform` / `.tenant`
   (allowlists, SP §4.7), list and detail shapes.
5. `server/src/routes/complaints.js`, mounted in `routes/api.js`:
   `POST /tenants/:tid/complaints`, `GET /tenants/:tid/complaints`,
   `GET /tenants/:tid/complaints/:number`, `GET /complaints`.
6. Tests: `server/test/complaints-api.test.js` (new), RBAC rows in
   `server/test/audit.test.js`, the divergence test in
   `server/test/rbac.test.js`, the tenant sweep in
   `server/test/tenant-isolation.test.js`.
7. ~~`npm run seed`: two sample complaints~~ Dropped while building
   (2026-11-09): the seed creates no users, so a sample complaint would have
   no real author. Sample complaints come from the dashboard's e2e seed
   (SRV-52) and from raising one in the dev dashboard.
8. Docs: SP §4.4 gets a **Complaints** table pointing to §4.15;
   `server/README.md` lists the routes.

## Spec

**Model** (`complaints`, strict, timestamps):

```js
{
  tenant_id: String,            // required, indexed with number (unique)
  number: Number,               // per tenant, from Tenant.complaint_seq
  title: String,                // 3–120 after trim
  description: String,          // 1–4000 after trim
  status: 'open' | 'with_service' | 'closed',   // default 'open'
  created_by: { user_id: ObjectId, name: String, email: String },
  last_activity_at: Date,       // creation, then every comment / status change
  events: [{                    // append-only, ≤ 300 (SRV-51 adds to it)
    _id: ObjectId, at: Date, kind: 'comment' | 'status',
    user_id: ObjectId, name: String, email: String,
    fuelbot: Boolean,           // the author was platform staff
    text: String, from: String, to: String,   // from/to only on 'status'
  }],
}
```

Indexes: `{tenant_id: 1, number: 1}` unique;
`{tenant_id: 1, last_activity_at: -1, _id: -1}`;
`{'created_by.user_id': 1, last_activity_at: -1}`;
`{status: 1, last_activity_at: -1}` (staff's list).

**Permissions** (`rbac.js`):

| Permission | platform_admin | tenant_admin | operator | viewer |
|---|---|---|---|---|
| `complaints:raise` | – | ✓ | ✓ | ✓ |
| `complaints:read_all` | ✓ (all tenants) | ✓ (own tenant) | – | – |
| `complaints:comment` | ✓ | ✓ | ✓ | ✓ |
| `complaints:reopen` | – (has `status`) | ✓ | ✓ | ✓ |
| `complaints:status` | ✓ | – | – | – |

- `TENANT_ONLY = ['complaints:raise', 'complaints:reopen']`: in
  `TENANT_ADMIN` but removed from the platform set. The existing test
  "platform_admin holds every tenant_admin permission" becomes "… except
  `TENANT_ONLY`", and a new test fails if `TENANT_ONLY` grows without
  updating it (exact list).
- `complaints:status` goes into `PLATFORM_ONLY`.
- **Visibility** `complaintScope(user)`: platform → `{}`;
  `complaints:read_all` → `{tenant_id}`; else
  `{tenant_id, 'created_by.user_id': user._id}`. The query uses it; a
  number outside it is **404** `not_found`.

**Routes:**

- `POST /tenants/:tid/complaints` (`complaints:raise`, own tenant)
  `{title, description}` → **201** `{complaint}` (detail view). Number:
  `Tenant.findOneAndUpdate({_id: tid}, {$inc: {complaint_seq: 1}}, {new: true})`.
  `created_by` and `last_activity_at` set by the server; `events: []`.
  Unknown fields → 400 `invalid_body` (like every write). Audited
  `complaint.create`, target `complaint:<number>`, `after: {title}`.
- `GET /tenants/:tid/complaints?status=open,with_service&limit&cursor`
  (`complaints:comment`, i.e. any signed-in member; scope above) →
  `{items: [list view], next_cursor}`, newest activity first. A bad status
  → 400 `invalid_status`.
- `GET /tenants/:tid/complaints/:number` → `{complaint}` (detail view);
  `:number` not a positive integer → 404.
- `GET /complaints?status&tenant&limit&cursor` (**platform** only; tenant
  roles 403, they use the tenant route) → the same list, with `tenant_id`
  and the tenant's name in each item.

**Cursor:** `findPage` sorts by `_id`; this list sorts by
`last_activity_at`. Add an option to `services/pages.js`
(`sort: 'last_activity_at'`, cursor = base64url of `<iso>|<id>`), with its
own test, rather than a second pager.

**Views:**

- List item: `{number, title, status, created_at, last_activity_at,
  created_by: {name}, comment_count}` (+ `tenant_id`, `tenant_name`,
  `created_by.email` for platform).
- Detail: the list item + `description`, `events: [{id, at, kind, text,
  from, to, author}]`.
- `author` for tenant users: `{name, fuelbot}`; a FuelBot author's name is
  shown as "FuelBot support · <name>" by the dashboard, and **no email**.
  Platform: `{name, email, fuelbot}`.
- Never in any view: `user_id`, IPs, audit fields.

## Acceptance criteria

- [x] `complaints-api.test.js` › "a tenant user raises a complaint": owner,
      operator and viewer each get 201, `status: 'open'`, numbers 1, 2, 3
      in order; an audit entry `complaint.create` per create.
- [x] › "numbers are per tenant and never repeat under concurrency": 20
      parallel creates on powerfuel → numbers 1–20, each once; globex
      starts at 1.
- [x] › "platform_admin can't raise": 403 `forbidden`.
- [x] › "validation": title of 2 or 121 characters, empty description,
      4001-character description, an extra field → 400 `invalid_body` with
      the field; surrounding spaces are trimmed before counting.
- [x] › "operators and viewers see only their own": desk sees desk's, not
      ops'; desk's GET of ops' number → 404.
- [x] › "tenant_admin sees the whole tenant, staff see all": owner lists
      every powerfuel complaint; `GET /complaints` lists both tenants;
      `?tenant=globex` only globex.
- [x] › "status filter and newest activity first": `?status=closed` only
      closed; order follows `last_activity_at` desc; the cursor walks two
      pages without gaps or repeats.
- [x] › "tenant view hides staff email": a staff event in the tenant view
      has `author: {name, fuelbot: true}` and no `email` anywhere in the
      JSON; the platform view has it.
- [x] `rbac.test.js` › "platform holds every tenant_admin permission except
      TENANT_ONLY" and › "TENANT_ONLY is exactly raise and reopen".
- [x] `audit.test.js` RBAC table rows (platform, tenant_admin, operator,
      viewer): `POST /tenants/powerfuel/complaints` 403/400/400/400
      (empty body); `GET /tenants/powerfuel/complaints` 200 ×4;
      `GET /tenants/globex/complaints` 404 for tenant roles;
      `GET /complaints` 200/403/403/403.
- [x] `tenant-isolation.test.js` sweep includes the complaint routes.
