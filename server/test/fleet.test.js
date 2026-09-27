import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeSale, makeUser, mockConfig, signIn, startServer } from './helpers.js';
import { Machine } from '../src/models/index.js';
import { importConfig } from '../src/services/catalog.js';
import { dayKey } from '../src/services/records.js';

describe('dayKey', () => {
  it('uses the display time zone (00:30 IST is still the previous UTC day)', () => {
    assert.equal(dayKey(new Date('2026-09-26T19:00:00Z'), 'Asia/Kolkata'), '2026-09-27');
    assert.equal(dayKey(new Date('2026-09-26T19:00:00Z'), 'UTC'), '2026-09-26');
  });
});

describe('/api/v1/fleet', () => {
  let ctx;
  let other;
  let globexMachine;
  const as = {};

  before(async () => { ctx = await startServer(); });
  after(async () => { await ctx.stop(); });
  beforeEach(async () => {
    await ctx.reset();
    await importConfig({ tenantId: 'powerfuel', tenantName: 'PowerFuel Gym', machineId: 'DEV00001', config: mockConfig() });
    other = (await importConfig({ tenantId: 'powerfuel', config: mockConfig() })).machine._id;
    globexMachine = (await importConfig({ tenantId: 'globex', tenantName: 'Globex', config: mockConfig() })).machine._id;
    const now = new Date();
    await Machine.collection.updateOne({ _id: 'DEV00001' },
      { $set: { last_seen_at: now, 'health.faults.HOMING_TIMEOUT': now } });
    await Machine.collection.updateOne({ _id: other }, { $set: { last_seen_at: now } });
    await makeSale({ charged_price: 75 });
    await makeSale({ charged_price: 180, dispensing_result: 'timeout', dispensing_reason: 'deadline' });
    await makeSale({ charged_price: 35, ts: new Date(Date.now() - 30 * 3600 * 1000) });   // an earlier day
    await makeSale({ machine_id: other, charged_price: 90 });
    const users = {
      ops: { email: 'ops@x.io', role: 'platform_admin' },
      owner: { email: 'owner@x.io', role: 'tenant_admin', tenant_id: 'powerfuel' },
      opOne: { email: 'op1@x.io', role: 'operator', tenant_id: 'powerfuel', machines: ['DEV00001'] },
    };
    for (const [key, fields] of Object.entries(users)) {
      await makeUser(fields);
      as[key] = await signIn(ctx.app, fields.email);
    }
  });

  it('platform: every machine with full status, and per-tenant counts', async () => {
    const res = await as.ops.get('/api/v1/fleet');
    assert.equal(res.status, 200);
    assert.equal(res.body.items.length, 3);
    const byId = Object.fromEntries(res.body.items.map((m) => [m.id, m]));
    assert.equal(byId.DEV00001.status, 'fault');
    assert.equal(byId[other].status, 'ok');
    assert.equal(byId[globexMachine].status, 'offline');
    const tenants = Object.fromEntries(res.body.tenants.map((t) => [t.id, t]));
    assert.deepEqual(tenants.powerfuel.counts, { ok: 1, maintenance: 0, fault: 1, offline: 0 });
    assert.deepEqual(tenants.globex.counts, { ok: 0, maintenance: 0, fault: 0, offline: 1 });
    assert.equal(res.body.tz, 'Asia/Kolkata');
  });

  it("today's sales per machine in the display time zone", async () => {
    const byId = Object.fromEntries((await as.ops.get('/api/v1/fleet')).body.items.map((m) => [m.id, m]));
    const t = byId.DEV00001.today;
    assert.equal(t.count, 2);
    assert.equal(t.revenue, 255);
    assert.equal(t.not_dispensed, 1);
    assert.equal(t.not_dispensed_amount, 180);
    assert.ok(t.last_sale_at);
    assert.equal(byId[other].today.count, 1);
    assert.equal(byId[globexMachine].today.count, 0);
  });

  it('tenant users: their machines only, without platform-only fields or the tenant summary', async () => {
    const res = await as.owner.get('/api/v1/fleet');
    assert.deepEqual(res.body.items.map((m) => m.id).sort(), ['DEV00001', other].sort());
    assert.ok(!('tenants' in res.body));
    const dev = res.body.items.find((m) => m.id === 'DEV00001');
    for (const key of ['status', 'faults', 'maintenance', 'last_seen_ip']) assert.ok(!(key in dev), key);
    assert.equal(dev.in_service, false);
    assert.equal(dev.today.count, 2);
    const limited = await as.opOne.get('/api/v1/fleet');
    assert.deepEqual(limited.body.items.map((m) => m.id), ['DEV00001']);
  });
});
