import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { mockConfig, startServer } from './helpers.js';
import { Machine, Sale, TelemetryEvent } from '../src/models/index.js';
import { importConfig } from '../src/services/catalog.js';

const ids = (tenant = 'powerfuel', machine = 'machine-042') => ({ 'X-Tenant-Id': tenant, 'X-Machine-Id': machine });
let seq = 0;
const eventId = () => `01J8Z6Q4M9X3T7C2V5B8N1K${String(++seq).padStart(3, '0')}`;

const common = (type, extra = {}) => ({
  v: 1, event_type: type, event_id: eventId(), tenant_id: 'powerfuel', machine_id: 'machine-042',
  timestamp: '2026-09-19T10:22:31Z', source: 'bridge', ...extra,
});

// Every event type the app posts (telemetry README event table, plan §3.3).
const SAMPLE_EVENTS = () => [
  common('dispense_cycle', {
    order_id: '01J8Z6Q4M9X3T7C2V5B8N1K4RD', hopper: 1, base: 'B2', result: 'DONE', reason: '',
    stages: [{ stage: 'HOMING_START', t_offset_ms: 0 }, { stage: 'DONE', t_offset_ms: 44050 }],
    fault: null, duration_ms: 44050, transaction_id: 'pay_1', flavor_id: 'guava', base_id: 'water', order_number: 4821,
  }),
  common('machine_fault', { fault: 'HOMING_TIMEOUT', order_id: null }),
  common('machine_ok', { cleared: 'HOMING_TIMEOUT' }),
  common('bridge_down', { source: 'app', silent_sec: 31 }),
  common('bridge_up', { source: 'app', down_sec: 42 }),
  common('image_download_failed', { source: 'app', flavor_id: 'guava', file_name: 'g.png', reason: 'http_404' }),
];

const SALE = (extra = {}) => ({
  order_id: '01J8Z6Q4M9X3T7C2V5B8N1K4RD', order_number: 4821, transaction_id: 'pay_QqR8xYz3vN2Kw1',
  flavor_id: 'guava', hopper: 1, base_id: 'water', actual_price: 90, offer_price: 75, charged_price: 75,
  currency: 'INR', payment_method: 'upi', dispensing_result: 'success', dispensing_reason: '',
  tenant_id: 'powerfuel', machine_id: 'machine-042', timestamp: '2026-09-19T10:22:31Z', ...extra,
});

describe('POST /fuelbot/telemetry and /fuelbot/sales', () => {
  let ctx;
  const post = (path, body, headers = ids()) => request(ctx.app).post(path).set(headers).send(body);
  const health = async () => {
    const m = await Machine.findById('machine-042').lean();
    return { faults: Object.keys(m.health.faults ?? {}).sort(), last: m.health.last_event_at };
  };

  before(async () => { ctx = await startServer(); });
  after(async () => { await ctx.stop(); });
  beforeEach(async () => {
    await ctx.reset();
    await importConfig({ tenantId: 'powerfuel', machineId: 'machine-042', config: mockConfig('default') });
  });

  it('stores every event type (201) and answers a repeat with 200 duplicate (contract test 3)', async () => {
    for (const event of SAMPLE_EVENTS()) {
      const res = await post('/fuelbot/telemetry', event);
      assert.equal(res.status, 201, event.event_type);
      assert.deepEqual(res.body, { ok: true });
      const again = await post('/fuelbot/telemetry', event);
      assert.equal(again.status, 200);
      assert.deepEqual(again.body, { ok: true, duplicate: true });
    }
    assert.equal(await TelemetryEvent.countDocuments(), 6);
    const cycle = await TelemetryEvent.findOne({ event_type: 'dispense_cycle' }).lean();
    assert.equal(cycle.stages.length, 2);
    assert.equal(cycle.order_number, 4821);
    assert.equal(cycle.fault, null);
    assert.equal(cycle.extra, undefined);
    assert.equal(cycle.body_tenant_id, undefined);   // same as the header: not repeated
    assert.equal(cycle.ts.toISOString(), '2026-09-19T10:22:31.000Z');
  });

  it('stores a sale (201), a repeat is 200 duplicate and the first is kept', async () => {
    let res = await post('/fuelbot/sales', SALE());
    assert.equal(res.status, 201);
    res = await post('/fuelbot/sales', SALE({ charged_price: 1 }));
    assert.equal(res.status, 200);
    assert.equal(res.body.duplicate, true);
    const sale = await Sale.findOne().lean();
    assert.equal(sale.charged_price, 75);
    assert.equal(sale.offer_price, 75);
    assert.equal(sale.machine_known, true);
    assert.equal(await Sale.countDocuments(), 1);
  });

  it('400 only for bodies that can never be valid', async () => {
    const bad = [
      ['/fuelbot/telemetry', [], 'invalid_event'],
      ['/fuelbot/telemetry', { event_type: 'x' }, 'invalid_event'],
      ['/fuelbot/telemetry', { event_id: 'e1' }, 'invalid_event'],
      ['/fuelbot/telemetry', { event_id: 5, event_type: 'x' }, 'invalid_event'],
      ['/fuelbot/sales', { charged_price: 75 }, 'invalid_sale'],
      ['/fuelbot/sales', { order_id: '' }, 'invalid_sale'],
    ];
    for (const [path, body, error] of bad) {
      const res = await post(path, body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(res.body.error, error);
    }
    const res = await request(ctx.app).post('/fuelbot/sales').set(ids())
      .set('Content-Type', 'application/json').send('{"order_id": ');
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'invalid_json');
  });

  it('401 without both ids (the app keeps and retries)', async () => {
    const res = await post('/fuelbot/sales', SALE(), { 'X-Tenant-Id': 'powerfuel' });
    assert.equal(res.status, 401);
    assert.equal(await Sale.countDocuments(), 0);
  });

  it('never drops a field: unknown and wrong-typed fields go to extra', async () => {
    const event = common('future_sensor', { hopper: '3', door: 'open', stages: [{ stage: 1 }], v: 2 });
    const res = await post('/fuelbot/telemetry', event);
    assert.equal(res.status, 201);
    const stored = await TelemetryEvent.findOne({ event_id: event.event_id }).lean();
    assert.equal(stored.event_type, 'future_sensor');
    assert.equal(stored.v, 2);
    assert.equal(stored.hopper, undefined);
    assert.equal(stored.stages, undefined);
    assert.deepEqual(stored.extra, { hopper: '3', door: 'open', stages: [{ stage: 1 }] });
  });

  it('the headers are the truth; different body ids are kept as body_*', async () => {
    await post('/fuelbot/sales', SALE({ tenant_id: 'old-tenant', machine_id: 'machine-001' })).expect(201);
    const sale = await Sale.findOne().lean();
    assert.equal(sale.tenant_id, 'powerfuel');
    assert.equal(sale.machine_id, 'machine-042');
    assert.equal(sale.body_tenant_id, 'old-tenant');
    assert.equal(sale.body_machine_id, 'machine-001');
  });

  it('a record from an unregistered machine is stored with machine_known false', async () => {
    const res = await post('/fuelbot/sales', SALE({ order_id: 'o-unreg' }), ids('powerfuel', 'machine-777'));
    assert.equal(res.status, 201);
    const sale = await Sale.findOne({ order_id: 'o-unreg' }).lean();
    assert.equal(sale.machine_known, false);
    assert.equal(sale.machine_id, 'machine-777');
  });

  it('an unparseable timestamp falls back to the receive time, and the raw value is kept', async () => {
    await post('/fuelbot/sales', SALE({ timestamp: 'yesterday' })).expect(201);
    const sale = await Sale.findOne().lean();
    assert.equal(sale.timestamp, 'yesterday');
    assert.equal(sale.ts.getTime(), sale.received_at.getTime());
  });

  it('health follows fault events in client-time order', async () => {
    const at = (s) => `2026-09-19T10:00:${String(s).padStart(2, '0')}Z`;
    await post('/fuelbot/telemetry', common('machine_fault', { fault: 'HOMING_TIMEOUT', timestamp: at(10) }));
    await post('/fuelbot/telemetry', common('bridge_down', { timestamp: at(20) }));
    assert.deepEqual((await health()).faults, ['BRIDGE_DOWN', 'HOMING_TIMEOUT']);

    // A late, older event is stored but doesn't change health.
    await post('/fuelbot/telemetry', common('bridge_up', { timestamp: at(5) })).expect(201);
    assert.deepEqual((await health()).faults, ['BRIDGE_DOWN', 'HOMING_TIMEOUT']);

    await post('/fuelbot/telemetry', common('machine_ok', { cleared: 'HOMING_TIMEOUT', timestamp: at(30) }));
    assert.deepEqual((await health()).faults, ['BRIDGE_DOWN']);
    await post('/fuelbot/telemetry', common('bridge_up', { timestamp: at(40) }));
    const h = await health();
    assert.deepEqual(h.faults, []);
    assert.equal(h.last.toISOString(), '2026-09-19T10:00:40.000Z');
  });

  it('machine_ok without a code clears every board fault but not BRIDGE_DOWN', async () => {
    await post('/fuelbot/telemetry', common('machine_fault', { fault: 'HOMING_TIMEOUT', timestamp: '2026-09-19T11:00:00Z' }));
    await post('/fuelbot/telemetry', common('bridge_down', { timestamp: '2026-09-19T11:00:01Z' }));
    await post('/fuelbot/telemetry', common('machine_ok', { timestamp: '2026-09-19T11:00:02Z' }));
    assert.deepEqual((await health()).faults, ['BRIDGE_DOWN']);
  });

  it('an unregistered machine\'s fault events are stored but change no health', async () => {
    await post('/fuelbot/telemetry', common('machine_fault', { fault: 'HOMING_TIMEOUT' }), ids('powerfuel', 'machine-777'))
      .expect(201);
    assert.deepEqual((await health()).faults, []);
  });
});
