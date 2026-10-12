// /api/v1/fleet (plan §4.9): every machine the caller may see, with status and today's sales.
// Platform: full status, grouped by tenant with counts per status. Tenant users: their view.
// ?tenant= narrows to one tenant (tenant users: their own only, else 404).
import express from 'express';
import { Machine, Tenant } from '../models/index.js';
import { canSeeMachine, guard, isPlatform } from '../auth/rbac.js';
import { machineStatus } from '../services/health.js';
import { machineView } from '../services/views.js';
import { EMPTY_TODAY, machineTenantFilter, salesToday } from '../services/records.js';

export function fleetRouter() {
  const router = express.Router();
  router.use(guard('machines:read'));

  router.get('/', async (req, res) => {
    const settings = req.app.locals.settings;
    const platform = isPlatform(req.user);
    const filter = machineTenantFilter(req.user, req.query);
    const machines = (await Machine.find(filter).sort({ tenant_id: 1, name: 1, _id: 1 }).lean())
      .filter((m) => canSeeMachine(req.user, m));
    const today = await salesToday(machines.map((m) => m._id), settings.displayTz);
    const items = machines.map((m) => {
      const status = machineStatus(m, settings);
      return { ...machineView(m, status, { platform }), today: today.get(m._id) ?? EMPTY_TODAY };
    });
    const body = { items, tz: settings.displayTz };
    if (platform) {
      const tenants = await Tenant.find(filter.tenant_id ? { _id: filter.tenant_id } : {}, { name: 1 }).sort({ _id: 1 }).lean();
      body.tenants = tenants.map((t) => {
        const counts = { ok: 0, maintenance: 0, fault: 0, offline: 0 };
        for (const i of items) if (i.tenant_id === t._id) counts[i.status] += 1;
        return { id: t._id, name: t.name, machines: Object.values(counts).reduce((a, b) => a + b, 0), counts };
      });
    }
    res.json(body);
  });

  return router;
}
