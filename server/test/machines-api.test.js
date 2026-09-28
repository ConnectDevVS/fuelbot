import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { makeUser, mockConfig, signIn, startServer } from './helpers.js';
import { AuditEntry, Machine, Tenant } from '../src/models/index.js';
import { importConfig } from '../src/services/catalog.js';
import { MACHINE_ID_PATTERN } from '../src/services/machines.js';

const BASE = '/api/v1/tenants/powerfuel/machines';
const PLATFORM_ONLY_KEYS = ['status', 'faults', 'maintenance', 'last_seen_ip'];

describe('/api/v1/tenants/:tid/machines', () => {
  let ctx;
  let other;
  const as = {};
  const version = async (id) => (await Machine.findById(id)).menu_version;

  before(async () => { ctx = await startServer(); });
  after(async () => { await ctx.stop(); });
  beforeEach(async () => {
    await ctx.reset();
    await importConfig({ tenantId: 'powerfuel', tenantName: 'PowerFuel Gym', machineId: 'DEV00001', config: mockConfig() });
    other = (await importConfig({ tenantId: 'powerfuel', config: mockConfig() })).machine._id;
    await Tenant.create({ _id: 'globex', name: 'Globex' });
    const users = {
      ops: { email: 'ops@x.io', name: 'Ops Team', role: 'platform_admin' },
      owner: { email: 'owner@x.io', role: 'tenant_admin', tenant_id: 'powerfuel' },
      op: { email: 'op@x.io', role: 'operator', tenant_id: 'powerfuel' },
      opOne: { email: 'op1@x.io', role: 'operator', tenant_id: 'powerfuel', machines: ['DEV00001'] },
      viewer: { email: 'v@x.io', role: 'viewer', tenant_id: 'powerfuel' },
      boss: { email: 'boss@x.io', role: 'tenant_admin', tenant_id: 'globex' },
    };
    for (const [key, fields] of Object.entries(users)) {
      await makeUser(fields);
      as[key] = await signIn(ctx.app, fields.email);
    }
  });

  it('a tenant_admin registers a machine: the server generates its id', async () => {
    const res = await as.owner.post(BASE, { name: 'Bay 3', location_label: 'FUELBOT · BAY 03' });
    assert.equal(res.status, 201);
    assert.match(res.body.machine.id, MACHINE_ID_PATTERN);
    assert.equal(res.body.machine.configured, false);
    assert.deepEqual(res.body.machine.bases.map((b) => b.id), ['water']);
    assert.equal((await as.op.post(BASE, { name: 'x' })).status, 403);
    assert.equal((await as.owner.post(BASE, { name: 'x', id: 'MINE0001' })).status, 400, 'ids are never chosen');
    assert.equal((await AuditEntry.findOne({ action: 'machine.register' })).machine_id, res.body.machine.id);
    // Settings can change before it's configured (its empty menu isn't validated).
    const patch = await as.owner.patch(`${BASE}/${res.body.machine.id}`, { site: 'Lobby' }).set('If-Match', '0');
    assert.equal(patch.status, 200);
  });

  it('lists what the caller may see; tenant users never get platform-only fields', async () => {
    const mine = await as.owner.get(BASE);
    assert.deepEqual(mine.body.items.map((m) => m.id).sort(), ['DEV00001', other].sort());
    const limited = await as.opOne.get(BASE);
    assert.deepEqual(limited.body.items.map((m) => m.id), ['DEV00001']);
    for (const who of ['owner', 'op', 'viewer']) {
      const res = await as[who].get(`${BASE}/DEV00001`);
      for (const key of PLATFORM_ONLY_KEYS) assert.ok(!(key in res.body.machine), `${who} got ${key}`);
    }
    const full = await as.ops.get(`${BASE}/DEV00001`);
    for (const key of PLATFORM_ONLY_KEYS) assert.ok(key in full.body.machine, `platform lacks ${key}`);
    assert.equal((await as.opOne.get(`${BASE}/${other}`)).status, 404);
    assert.equal((await as.boss.get(`${BASE}/DEV00001`)).status, 404);
    assert.equal((await as.boss.get('/api/v1/tenants/globex/machines/DEV00001')).status, 404, 'wrong tenant path');
  });

  it('status: platform sees the fault; tenant users only "out of service"', async () => {
    await Machine.collection.updateOne({ _id: 'DEV00001' },
      { $set: { last_seen_at: new Date(), 'health.faults.HOMING_TIMEOUT': new Date('2026-09-27T10:00:00Z') } });
    const p = (await as.ops.get(`${BASE}/DEV00001`)).body.machine;
    assert.equal(p.status, 'fault');
    assert.equal(p.faults[0].code, 'HOMING_TIMEOUT');
    const t = (await as.viewer.get(`${BASE}/DEV00001`)).body.machine;
    assert.equal(t.online, true);
    assert.equal(t.in_service, false);
    assert.ok(!JSON.stringify(t).includes('HOMING_TIMEOUT'));
    const off = (await as.ops.get(`${BASE}/${other}`)).body.machine;
    assert.equal(off.status, 'offline');
  });

  it('settings need If-Match and bump menu_version; the kiosk header follows', async () => {
    assert.equal((await as.owner.patch(`${BASE}/DEV00001`, { location_label: 'BAY 9' })).status, 428);
    const v = await version('DEV00001');
    const res = await as.owner.patch(`${BASE}/DEV00001`, { location_label: 'BAY 9' }).set('If-Match', String(v));
    assert.equal(res.status, 200);
    assert.equal(res.body.machine.menu_version, v + 1);
    const cfg = await request(ctx.app).get('/fuelbot/config').set({ 'X-Tenant-Id': 'powerfuel', 'X-Machine-Id': 'DEV00001' });
    assert.equal(cfg.body.tenant.location_label, 'BAY 9');
    assert.equal((await as.op.patch(`${BASE}/DEV00001`, { name: 'x' }).set('If-Match', String(v + 1))).status, 403);
  });

  it('config preview: the app\'s verdict; maintenance only for platform', async () => {
    const t = (await as.viewer.get(`${BASE}/DEV00001/config`)).body;
    assert.equal(t.configured, true);
    assert.deepEqual(t.errors, []);
    assert.ok(!('maintenance' in t.config));
    assert.equal(t.config.flavors.length, 6);
    assert.ok('maintenance' in (await as.ops.get(`${BASE}/DEV00001/config`)).body.config);
    const fresh = (await as.owner.post(BASE, { name: 'New' })).body.machine.id;
    const empty = (await as.owner.get(`${BASE}/${fresh}/config`)).body;
    assert.equal(empty.configured, false);
    assert.deepEqual(empty.errors, ['flavors must be a non-empty array']);
  });

  it('bases: tenant_admin+, at least one enabled, unique ids', async () => {
    const put = (who, bases) => as[who].put(`${BASE}/DEV00001/bases`, { bases }).set('If-Match', '1');
    assert.equal((await Machine.findById('DEV00001')).menu_version, 1);
    assert.equal((await put('owner', [{ id: 'water', name: 'Water', code: 'B2', enabled: false }])).status, 400);
    assert.equal((await put('owner', [{ id: 'w', name: 'W', code: 'B2', enabled: true },
      { id: 'w', name: 'W2', code: 'B1', enabled: true }])).status, 400);
    assert.equal((await put('op', [{ id: 'water', name: 'Water', code: 'B2', enabled: true }])).status, 403);
    const ok = await put('owner', [{ id: 'water', name: 'Water', code: 'B2', enabled: true },
      { id: 'milk', name: 'Milk', code: 'B1', enabled: true }]);
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body.machine.bases.map((b) => b.id), ['water', 'milk']);
  });

  it('maintenance: platform only; flagged_by/at set on, cleared off; the kiosk sees it', async () => {
    assert.equal((await as.owner.put(`${BASE}/DEV00001/maintenance`, { enabled: true })).status, 403);
    const on = await as.ops.put(`${BASE}/DEV00001/maintenance`, { enabled: true, message: 'Back soon',
      faults: [{ code: 'E-1', description: 'Blender hot' }] });
    assert.equal(on.status, 200);
    assert.equal(on.body.machine.maintenance.flagged_by, 'Ops Team');
    const kiosk = (await request(ctx.app).get('/fuelbot/config')
      .set({ 'X-Tenant-Id': 'powerfuel', 'X-Machine-Id': 'DEV00001' })).body.maintenance;
    assert.equal(kiosk.enabled, true);
    assert.equal(kiosk.message, 'Back soon');
    assert.match(kiosk.flagged_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    const off = await as.ops.put(`${BASE}/DEV00001/maintenance`, { enabled: false });
    assert.equal(off.body.machine.maintenance.flagged_by, null);
    assert.equal(off.body.machine.maintenance.flagged_at, null);
    assert.equal((await AuditEntry.countDocuments({ action: 'machine.maintenance' })), 2);
  });
});
