// /api/v1/tenants/:tid/complaints and /api/v1/complaints (plan §4.15): tenant users raise
// complaints and read the ones they may see (complaintScope); staff see every tenant's. Whoever
// sees one comments on it; staff change its status, tenant users reopen it, always with a comment.
import express from 'express';
import { Complaint, COMPLAINT_STATUSES, MAX_EVENTS, Tenant } from '../models/index.js';
import { assertCan, complaintScope, guard, hasPermission, isPlatform } from '../auth/rbac.js';
import { checkBody, required } from '../catalog/input.js';
import { complaintListView, complaintView } from '../services/views.js';
import { findPage } from '../services/pages.js';
import { audit } from '../services/audit.js';
import { loadTenant } from './tenants.js';
import { HttpError } from '../errors.js';

/** Plain text of min–max characters after trimming. */
export const text = (min, max) => (v) => (typeof v === 'string' && v.trim().length >= min && v.trim().length <= max
  ? null : `${min}–${max} characters`);

const status = () => (v) => (COMPLAINT_STATUSES.includes(v) ? null : COMPLAINT_STATUSES.join(' | '));

const RAISE_BODY = { title: required(text(3, 120)), description: required(text(1, 4000)) };
const COMMENT_BODY = { text: required(text(1, 2000)) };
const STATUS_BODY = { from: required(status()), to: required(status()), text: required(text(1, 2000)) };

/** ?status=open,with_service → a filter (absent: every status). */
function statusFilter(query) {
  if (query.status === undefined || query.status === '') return {};
  const wanted = String(query.status).split(',');
  if (wanted.some((s) => !COMPLAINT_STATUSES.includes(s))) throw new HttpError(400, 'invalid_status');
  return { status: { $in: wanted } };
}

/** The user's view options for a complaint response. */
const viewOptions = (user, tenant) => ({ platform: isPlatform(user), tenantName: tenant.name });

/** A complaint of tenant :tid that the user may see, or 404. */
export async function loadComplaint(req) {
  const tenant = await loadTenant(req.user, req.params.tid);
  assertCan(req.user, 'complaints:comment', { tenantId: tenant._id });
  const number = /^[1-9]\d{0,8}$/.test(req.params.number) ? Number(req.params.number) : null;
  if (number === null) throw new HttpError(404, 'not_found');
  const complaint = await Complaint.findOne({ ...complaintScope(req.user), tenant_id: tenant._id, number }).lean();
  if (!complaint) throw new HttpError(404, 'not_found');
  return { tenant, complaint };
}

/** A timeline entry by the signed-in user. */
const entry = (user, fields) => ({
  at: new Date(), user_id: user._id, name: user.name ?? '', email: user.email, fuelbot: isPlatform(user), ...fields,
});

/**
 * Appends an entry in one atomic update: only while the thread has room and, for a status change,
 * while the complaint still has the status the user saw. Nothing matched → 409 with the reason.
 */
async function append(complaint, event, { from, to } = {}) {
  const where = { _id: complaint._id, [`events.${MAX_EVENTS - 1}`]: { $exists: false } };
  const set = { last_activity_at: event.at };
  if (to !== undefined) {
    where.status = from;
    set.status = to;
  }
  const saved = await Complaint.findOneAndUpdate(where, { $push: { events: event }, $set: set },
    { returnDocument: 'after' }).lean();
  if (saved) return saved;
  const now = await Complaint.findById(complaint._id, { status: 1 }).lean();
  if (to !== undefined && now.status !== from) throw new HttpError(409, 'status_changed', { status: now.status });
  throw new HttpError(409, 'complaint_full');
}

export function complaintsRouter() {
  const router = express.Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    const tenant = await loadTenant(req.user, req.params.tid);
    assertCan(req.user, 'complaints:comment', { tenantId: tenant._id });
    const filter = { ...complaintScope(req.user), tenant_id: tenant._id, ...statusFilter(req.query) };
    const options = { platform: isPlatform(req.user), tenantNames: new Map([[tenant._id, tenant.name]]) };
    res.json(await findPage(Complaint, filter, req.query, (c) => complaintListView(c, options),
      { sortBy: 'last_activity_at', select: { description: 0, 'events.text': 0 } }));
  });

  router.post('/', async (req, res) => {
    const tenant = await loadTenant(req.user, req.params.tid);
    assertCan(req.user, 'complaints:raise', { tenantId: tenant._id });
    const body = checkBody(req.body, RAISE_BODY);
    const { complaint_seq: number } = await Tenant.findByIdAndUpdate(tenant._id, { $inc: { complaint_seq: 1 } },
      { returnDocument: 'after', projection: { complaint_seq: 1 } }).lean();
    const now = new Date();
    const complaint = await Complaint.create({
      tenant_id: tenant._id, number, title: body.title.trim(), description: body.description.trim(),
      created_by: { user_id: req.user._id, name: req.user.name ?? '', email: req.user.email },
      last_activity_at: now,
    });
    await audit(req, { action: 'complaint.create', tenant_id: tenant._id, target: `complaint:${number}`,
      after: { title: complaint.title } });
    res.status(201).json({ complaint: complaintView(complaint.toObject(), viewOptions(req.user, tenant)) });
  });

  router.get('/:number', async (req, res) => {
    const { tenant, complaint } = await loadComplaint(req);
    res.json({ complaint: complaintView(complaint, viewOptions(req.user, tenant)) });
  });

  router.post('/:number/comments', async (req, res) => {
    const { tenant, complaint } = await loadComplaint(req);
    const body = checkBody(req.body, COMMENT_BODY);
    const saved = await append(complaint, entry(req.user, { kind: 'comment', text: body.text.trim() }));
    await audit(req, { action: 'complaint.comment', tenant_id: tenant._id, target: `complaint:${complaint.number}` });
    res.status(201).json({ complaint: complaintView(saved, viewOptions(req.user, tenant)) });
  });

  // Staff: any status to any other. Tenant users who can see it: reopen a closed one only.
  router.post('/:number/status', async (req, res) => {
    const { tenant, complaint } = await loadComplaint(req);
    const { from, to, text: comment } = checkBody(req.body, STATUS_BODY);
    if (to === from) throw new HttpError(400, 'status_unchanged');
    const reopen = from === 'closed' && to === 'open';
    if (!hasPermission(req.user, 'complaints:status') && !(reopen && hasPermission(req.user, 'complaints:reopen'))) {
      throw new HttpError(403, 'forbidden');
    }
    const saved = await append(complaint, entry(req.user, { kind: 'status', from, to, text: comment.trim() }), { from, to });
    await audit(req, { action: 'complaint.status', tenant_id: tenant._id, target: `complaint:${complaint.number}`,
      before: { status: from }, after: { status: to } });
    res.status(201).json({ complaint: complaintView(saved, viewOptions(req.user, tenant)) });
  });

  return router;
}

/** /api/v1/complaints[?status=&tenant=]: every tenant's complaints (staff only). */
export function allComplaintsRouter() {
  const router = express.Router();
  router.use(guard('complaints:status'));   // stands for "platform": tenant users use their tenant's list

  router.get('/', async (req, res) => {
    const filter = statusFilter(req.query);
    if (typeof req.query.tenant === 'string' && req.query.tenant) filter.tenant_id = req.query.tenant;
    const tenantNames = new Map((await Tenant.find({}, { name: 1 }).lean()).map((t) => [t._id, t.name]));
    res.json(await findPage(Complaint, filter, req.query, (c) => complaintListView(c, { platform: true, tenantNames }),
      { sortBy: 'last_activity_at', select: { description: 0, 'events.text': 0 } }));
  });

  return router;
}
