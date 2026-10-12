import { describe, expect, it } from 'vitest';
import { buildFleet } from './fleetModel.js';

const m = (id, tenant_id, status, name = '', extra = {}) => ({ id, tenant_id, status, name, location_label: null, ...extra });
// Shaped like the seeded /fleet (platform view).
const FLEET = {
  items: [
    m('E2E00002', 'powerfuel', 'ok', 'Bay 3'),
    m('DEV00001', 'powerfuel', 'fault', 'Bay 02'),
    m('E2E00004', 'powerfuel', 'offline', 'Old bay'),
    m('E2E00003', 'powerfuel', 'offline', 'Bay 4'),
    m('MAINT001', 'powerfuel', 'maintenance', 'Annex'),
    m('E2E00005', 'globex', 'ok', 'Globex Main'),
    m('K7Q2M9XA', 'globex', 'ok', '', { location_label: 'GLOBEX · GYM 2' }),
  ],
  tenants: [
    { id: 'powerfuel', name: 'PowerFuel Gym', machines: 5, counts: { ok: 1, maintenance: 1, fault: 1, offline: 2 } },
    { id: 'globex', name: 'Globex Fitness', machines: 2, counts: { ok: 2, maintenance: 0, fault: 0, offline: 0 } },
    { id: 'acme', name: 'Acme Health', machines: 0, counts: { ok: 0, maintenance: 0, fault: 0, offline: 0 } },
  ],
};
const ids = (section) => section.rows.map((r) => r.id);

describe('fleetModel', () => {
  it('worst status first, then name', () => {
    const { sections } = buildFleet(FLEET);
    const pf = sections.find((s) => s.tenant.id === 'powerfuel');
    expect(ids(pf)).toEqual(['E2E00003', 'E2E00004', 'DEV00001', 'MAINT001', 'E2E00002']);
    // Sections by tenant name; a tenant with no machines is still listed.
    expect(sections.map((s) => s.tenant.id)).toEqual(['acme', 'globex', 'powerfuel']);
    expect(sections[0].rows).toEqual([]);
    // Names fall back to the location label (GLOBEX · GYM 2 < Globex Main).
    expect(ids(sections[1])).toEqual(['K7Q2M9XA', 'E2E00005']);
  });

  it('counts per tenant match', () => {
    const { counts, total, sections } = buildFleet(FLEET);
    expect(counts).toEqual({ offline: 2, fault: 1, maintenance: 1, ok: 3 });
    expect(total).toBe(7);
    for (const s of sections) {
      const byStatus = s.rows.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
      for (const [status, n] of Object.entries(s.tenant.counts)) expect(byStatus[status] ?? 0, `${s.tenant.id} ${status}`).toBe(n);
    }
  });

  it('filters combine (status + tenant + search)', () => {
    const faultOrOffline = buildFleet(FLEET, { statuses: new Set(['fault', 'offline']) });
    expect(faultOrOffline.sections.map((s) => s.tenant.id)).toEqual(['powerfuel']);   // empty sections hidden while filtering
    expect(ids(faultOrOffline.sections[0])).toEqual(['E2E00003', 'E2E00004', 'DEV00001']);
    const inGlobex = buildFleet(FLEET, { tenant: 'globex', statuses: new Set(['ok']) });
    expect(inGlobex.sections.map((s) => s.tenant.id)).toEqual(['globex']);
    const search = buildFleet(FLEET, { search: ' gym 2 ' });
    expect(search.sections.flatMap(ids)).toEqual(['K7Q2M9XA']);
    const byId = buildFleet(FLEET, { search: 'dev0000', statuses: new Set(['fault']), tenant: 'powerfuel' });
    expect(byId.sections.flatMap(ids)).toEqual(['DEV00001']);
    expect(buildFleet(FLEET, { search: 'nothing', statuses: new Set() }).sections).toEqual([]);
    // Counts stay the whole fleet's (the chips), whatever is filtered.
    expect(byId.counts).toEqual(buildFleet(FLEET).counts);
  });
});
