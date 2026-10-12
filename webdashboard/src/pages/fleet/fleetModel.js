// Fleet (dashboard plan §5.2) as a pure function of GET /fleet and the page's filters: sections per
// tenant (every tenant, even with no machines), rows worst status first (offline > fault >
// maintenance > ok), then by name; the summary counts; filters combine (status AND tenant AND search).
import { machineName } from '../../lib/names.js';

export const STATUS_ORDER = ['offline', 'fault', 'maintenance', 'ok'];

const rank = (s) => {
  const i = STATUS_ORDER.indexOf(s);
  return i === -1 ? STATUS_ORDER.length : i;
};

export function byWorstThenName(a, b) {
  return rank(a.status) - rank(b.status)
    || machineName(a).localeCompare(machineName(b), 'en', { sensitivity: 'base' })
    || a.id.localeCompare(b.id);
}

function matches(m, search) {
  if (!search) return true;
  const q = search.trim().toLowerCase();
  return [machineName(m), m.id, m.location_label ?? ''].some((v) => v.toLowerCase().includes(q));
}

/**
 * fleet: {items, tenants}. filters: {statuses: Set (empty = all), tenant: id | null, search: string}.
 * → {counts: {offline, fault, maintenance, ok}, total, sections: [{tenant, rows}], filtered: boolean}
 */
export function buildFleet(fleet, { statuses = new Set(), tenant = null, search = '' } = {}) {
  const items = fleet?.items ?? [];
  const tenants = fleet?.tenants ?? [];
  const counts = { offline: 0, fault: 0, maintenance: 0, ok: 0 };
  for (const t of tenants) for (const s of STATUS_ORDER) counts[s] += t.counts?.[s] ?? 0;

  // Every tenant from the summary, plus any tenant a machine names that the summary lacks.
  const known = new Map(tenants.map((t) => [t.id, t]));
  for (const m of items) {
    if (!known.has(m.tenant_id)) known.set(m.tenant_id, { id: m.tenant_id, name: m.tenant_id, machines: 0, counts: {} });
  }
  const filtered = statuses.size > 0 || Boolean(search.trim());
  const sections = [...known.values()]
    .filter((t) => !tenant || t.id === tenant)
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
    .map((t) => ({
      tenant: t,
      rows: items
        .filter((m) => m.tenant_id === t.id && (statuses.size === 0 || statuses.has(m.status)) && matches(m, search))
        .sort(byWorstThenName),
    }))
    .filter((section) => !filtered || section.rows.length > 0);
  return { counts, total: items.length, sections, filtered };
}
