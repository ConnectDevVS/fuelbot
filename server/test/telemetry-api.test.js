import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeSale, makeUser, mockConfig, signIn, startServer } from './helpers.js';
import { TelemetryEvent } from '../src/models/index.js';
import { importConfig } from '../src/services/catalog.js';
import { faultIntervals } from '../src/routes/telemetry.js';

const t = (s) => new Date(`2026-09-27T10:00:${String(s).padStart(2, '0')}Z`);
let n = 0;
async function makeEvent(fields) {
  const ts = fields.ts ?? new Date();
  return TelemetryEvent.create({ event_id: `e-${n += 1}`, tenant_id: 'powerfuel', machine_id: 'DEV00001',
    source: 'bridge', v: 1, received_at: ts, machine_known: true, ...fields, ts });
}

describe('faultIntervals', () => {
  it('opens and closes per machine and code in client-time order', () => {
    const e = (event_type, s, extra = {}) => ({ event_type, ts: t(s), machine_id: 'M', tenant_id: 'T', ...extra });
    const items = faultIntervals([
      e('machine_fault', 1, { fault: 'HOMING_TIMEOUT' }),
      e('machine_fault', 2, { fault: 'HOMING_TIMEOUT' }),   // already open: ignored
      e('bridge_down', 3),
      e('machine_ok', 5),                                  // no code: every board fault, not BRIDGE_DOWN
      e('bridge_up', 9),
      e('machine_fault', 20, { fault: 'NOT_HOMED' }),       // still open
    ]);
    assert.deepEqual(items.map((i) => [i.code, i.from.getUTCSeconds(), i.to?.getUTCSeconds() ?? null, i.duration_sec]), [
      ['NOT_HOMED', 20, null, null],
      ['BRIDGE_DOWN', 3, 9, 6],
      ['HOMING_TIMEOUT', 1, 5, 4],
    ]);
  });
});

describe('/api/v1/telemetry, /faults, /orders', () => {
  let ctx;
  let other;
  const as = {};

  before(async () => { ctx = await startServer(); });
  after(async () => { await ctx.stop(); });
  beforeEach(async () => {
    await ctx.reset();
    await importConfig({ tenantId: 'powerfuel', tenantName: 'PowerFuel Gym', machineId: 'DEV00001', config: mockConfig() });
    other = (await importConfig({ tenantId: 'powerfuel', config: mockConfig() })).machine._id;
    await makeSale({ order_id: 'o1', ts: t(10) });
    await makeSale({ order_id: 'o2', machine_id: other, ts: t(11) });
    await makeSale({ order_id: 'g1', tenant_id: 'globex', machine_id: 'GLOBEX01', ts: t(12) });
    await makeEvent({ event_type: 'dispense_cycle', order_id: 'o1', result: 'DONE', ts: t(10),
      stages: [{ stage: 'DONE', t_offset_ms: 44050 }] });
    await makeEvent({ event_type: 'machine_fault', fault: 'HOMING_TIMEOUT', ts: t(20) });
    await makeEvent({ event_type: 'machine_ok', cleared: 'HOMING_TIMEOUT', ts: t(30) });
    await makeEvent({ event_type: 'bridge_down', machine_id: other, source: 'app', ts: t(40) });
    await makeEvent({ event_type: 'image_download_failed', flavor_id: 'guava', reason: 'http_404', source: 'app', ts: t(50) });
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

  it('telemetry: platform only, newest first, filters by type, machine and order', async () => {
    const all = await as.ops.get('/api/v1/telemetry');
    assert.equal(all.status, 200);
    assert.deepEqual(all.body.items.map((e) => e.event_type),
      ['image_download_failed', 'bridge_down', 'machine_ok', 'machine_fault', 'dispense_cycle']);
    assert.equal((await as.ops.get('/api/v1/telemetry?type=machine_fault')).body.items.length, 1);
    assert.equal((await as.ops.get(`/api/v1/telemetry?machine=${other}`)).body.items.length, 1);
    const [cycle] = (await as.ops.get('/api/v1/telemetry?order_id=o1')).body.items;
    assert.equal(cycle.stages[0].t_offset_ms, 44050);
    assert.equal((await as.owner.get('/api/v1/telemetry')).status, 403);
  });

  it('faults: intervals per machine; open ones have no end; platform only', async () => {
    const res = await as.ops.get('/api/v1/faults');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.items.map((i) => [i.machine_id, i.code, i.duration_sec]), [
      [other, 'BRIDGE_DOWN', null],
      ['DEV00001', 'HOMING_TIMEOUT', 10],
    ]);
    const later = await as.ops.get(`/api/v1/faults?from=${t(35).toISOString()}`);
    assert.deepEqual(later.body.items.map((i) => i.code), ['BRIDGE_DOWN'], 'closed before from: dropped');
    const earlier = await as.ops.get(`/api/v1/faults?to=${t(25).toISOString()}`);
    assert.deepEqual(earlier.body.items.map((i) => [i.code, i.to]), [['HOMING_TIMEOUT', null]], 'open as of to');
    assert.equal((await as.owner.get('/api/v1/faults')).status, 403);
  });

  it('orders: the sale in the caller\'s view; telemetry for platform only', async () => {
    const p = (await as.ops.get('/api/v1/orders/o1')).body;
    assert.equal(p.sale.dispensing_result, 'success');
    assert.deepEqual(p.telemetry.map((e) => e.event_type), ['dispense_cycle']);
    const tUser = (await as.owner.get('/api/v1/orders/o1')).body;
    assert.equal(tUser.sale.dispensed, true);
    assert.ok(!('telemetry' in tUser) && !('dispensing_result' in tUser.sale));
    assert.equal((await as.owner.get('/api/v1/orders/g1')).status, 404, 'another tenant');
    assert.equal((await as.opOne.get('/api/v1/orders/o2')).status, 404, 'another machine');
    assert.equal((await as.ops.get('/api/v1/orders/nope')).status, 404);
  });
});
