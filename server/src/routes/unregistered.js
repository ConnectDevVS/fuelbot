// /api/v1/unregistered (platform only, plan §4.4): machine ids seen on ingest that aren't
// registered to the tenant they claimed. Ids come only from the server, so each one is a
// provisioning mistake (a typo, or the wrong tenant in the machine's files).
import express from 'express';
import { Machine, Sale, TelemetryEvent } from '../models/index.js';
import { guard } from '../auth/rbac.js';

const GROUP = [
  { $match: { machine_known: false } },
  { $group: { _id: { tenant_id: '$tenant_id', machine_id: '$machine_id' }, n: { $sum: 1 },
    first: { $min: '$received_at' }, last: { $max: '$received_at' } } },
];

export function unregisteredRouter() {
  const router = express.Router();
  router.use(guard('unregistered:read'));

  router.get('/', async (req, res) => {
    const [sales, events] = await Promise.all([Sale.aggregate(GROUP), TelemetryEvent.aggregate(GROUP)]);
    const rows = new Map();
    const add = (list, kind) => {
      for (const r of list) {
        const key = `${r._id.tenant_id}\u0000${r._id.machine_id}`;
        const row = rows.get(key) ?? { tenant_id: r._id.tenant_id, machine_id: r._id.machine_id, sales: 0,
          telemetry: 0, first_seen: r.first, last_seen: r.last };
        row[kind] = r.n;
        if (r.first < row.first_seen) row.first_seen = r.first;
        if (r.last > row.last_seen) row.last_seen = r.last;
        rows.set(key, row);
      }
    };
    add(sales, 'sales');
    add(events, 'telemetry');
    const ids = [...new Set([...rows.values()].map((r) => r.machine_id))];
    const existing = new Map((await Machine.find({ _id: { $in: ids } }, { tenant_id: 1 }).lean()).map((m) => [m._id, m.tenant_id]));
    const items = [...rows.values()]
      .map((r) => ({ ...r, registered_under: existing.get(r.machine_id) ?? null }))
      .sort((a, b) => b.last_seen - a.last_seen);
    res.json({ items });
  });

  return router;
}
