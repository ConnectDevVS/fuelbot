// /api/v1/tenants (plan §4.4): companies. Platform creates and disables them; a tenant_admin
// edits their own name and branding; members read their own.
import express from 'express';
import { Machine, Tenant } from '../models/index.js';
import { assertCan, guard, isPlatform } from '../auth/rbac.js';
import { checkBody, required, T } from '../catalog/input.js';
import { audit, diff } from '../services/audit.js';
import { isDuplicateKey } from '../db.js';
import { HttpError } from '../errors.js';

const BRANDING = T.object({
  display_name: T.string(60),
  logo_text: T.string(4),
  support_phone: T.string(30),
});

export function tenantView(tenant, machineCount) {
  return {
    id: tenant._id,
    name: tenant.name,
    branding: {
      display_name: tenant.branding?.display_name ?? null,
      logo_text: tenant.branding?.logo_text ?? null,
      support_phone: tenant.branding?.support_phone ?? null,
    },
    catalog_version: tenant.catalog_version ?? 0,
    disabled: Boolean(tenant.disabled),
    machine_count: machineCount ?? null,
    created_at: tenant.created_at ?? null,
  };
}

async function machineCounts(tenantIds) {
  const rows = await Machine.aggregate([
    { $match: { tenant_id: { $in: tenantIds } } },
    { $group: { _id: '$tenant_id', n: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [r._id, r.n]));
}

/** Loads a tenant the user may see, or 404. */
export async function loadTenant(user, tenantId) {
  assertCan(user, 'tenant:read', { tenantId });
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw new HttpError(404, 'not_found');
  return tenant;
}

export function tenantsRouter() {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const filter = isPlatform(req.user) ? {} : { _id: req.user.tenant_id };
    const tenants = await Tenant.find(filter).sort({ _id: 1 }).lean();
    const counts = await machineCounts(tenants.map((t) => t._id));
    res.json({ items: tenants.map((t) => tenantView(t, counts.get(t._id) ?? 0)) });
  });

  router.post('/', guard('tenants:create'), async (req, res) => {
    const body = checkBody(req.body, { id: required(T.slug()), name: required(T.nonEmpty(100)), branding: BRANDING });
    try {
      const tenant = await Tenant.create({ _id: body.id, name: body.name, branding: body.branding ?? {} });
      await audit(req, { action: 'tenant.create', tenant_id: tenant._id, target: `tenant:${tenant._id}`,
        after: { name: tenant.name, branding: body.branding ?? {} } });
      res.status(201).json({ tenant: tenantView(tenant, 0) });
    } catch (err) {
      if (isDuplicateKey(err)) throw new HttpError(409, 'tenant_exists');
      throw err;
    }
  });

  router.get('/:tid', async (req, res) => {
    const tenant = await loadTenant(req.user, req.params.tid);
    const counts = await machineCounts([tenant._id]);
    res.json({ tenant: tenantView(tenant, counts.get(tenant._id) ?? 0) });
  });

  router.patch('/:tid', async (req, res) => {
    const tenant = await loadTenant(req.user, req.params.tid);
    const body = checkBody(req.body, { name: T.nonEmpty(100), branding: BRANDING, disabled: T.bool() });
    if (body.name !== undefined || body.branding !== undefined) assertCan(req.user, 'tenant:edit', { tenantId: tenant._id });
    if (body.disabled !== undefined) assertCan(req.user, 'tenants:disable', { tenantId: tenant._id });
    const before = tenantView(tenant);
    if (body.name !== undefined) tenant.name = body.name;
    if (body.branding !== undefined) {
      tenant.branding = { ...(tenant.branding?.toObject?.() ?? tenant.branding ?? {}), ...body.branding };
      tenant.catalog_version += 1;   // branding is in every machine's config
    }
    if (body.disabled !== undefined) tenant.disabled = body.disabled;
    await tenant.save();
    const after = tenantView(tenant);
    const changes = diff(before, after, ['name', 'branding', 'disabled']);
    if (Object.keys(changes.after).length) {
      await audit(req, { action: 'tenant.update', tenant_id: tenant._id, target: `tenant:${tenant._id}`, ...changes });
    }
    const counts = await machineCounts([tenant._id]);
    res.json({ tenant: tenantView(tenant, counts.get(tenant._id) ?? 0) });
  });

  return router;
}
