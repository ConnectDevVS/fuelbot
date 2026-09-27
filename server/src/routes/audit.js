// /api/v1/audit: platform_admin only (plan §4.7). Filters: tenant, machine, user, action, from, to.
import express from 'express';
import mongoose from 'mongoose';
import { AuditEntry } from '../models/index.js';
import { guard } from '../auth/rbac.js';
import { auditView } from '../services/audit.js';
import { findPage } from '../services/pages.js';
import { HttpError } from '../errors.js';

function dateParam(value, name) {
  if (value === undefined) return undefined;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) throw new HttpError(400, `invalid_${name}`);
  return d;
}

export function auditRouter() {
  const router = express.Router();
  router.use(guard('audit:read'));

  router.get('/', async (req, res) => {
    const q = req.query;
    const filter = {};
    for (const [param, field] of [['tenant', 'tenant_id'], ['machine', 'machine_id'], ['action', 'action']]) {
      if (typeof q[param] === 'string') filter[field] = q[param];
    }
    if (typeof q.user === 'string') {
      if (!mongoose.Types.ObjectId.isValid(q.user)) throw new HttpError(400, 'invalid_user');
      filter.user_id = new mongoose.Types.ObjectId(q.user);
    }
    const from = dateParam(q.from, 'from');
    const to = dateParam(q.to, 'to');
    if (from || to) filter.at = { ...(from ? { $gte: from } : {}), ...(to ? { $lt: to } : {}) };
    res.json(await findPage(AuditEntry, filter, q, auditView));
  });

  return router;
}
