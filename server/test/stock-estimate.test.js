import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, mockConfig, signIn, startServer } from './helpers.js';
import { Machine, Product, TelemetryEvent } from '../src/models/index.js';
import { importConfig } from '../src/services/catalog.js';

const M = '/api/v1/tenants/powerfuel/machines';
let n = 0;

/** A dispense cycle for a hopper; dosed = PROTEIN_DISPENSED among its stages. */
async function cycle(hopper, { dosed = true, machine = 'DEV00001', ts } = {}) {
  n += 1;
  await new Promise((r) => { setTimeout(r, 2); });   // strictly after whatever came before
  ts = ts ?? new Date();
  const stages = [{ stage: 'HOMING_DONE', t_offset_ms: 1800 }, ...(dosed ? [{ stage: 'PROTEIN_DISPENSED', t_offset_ms: 7600 }] : [])];
  return TelemetryEvent.create({ event_id: `c-${n}`, event_type: 'dispense_cycle', tenant_id: 'powerfuel', machine_id: machine,
    hopper, stages, result: dosed ? 'DONE' : 'REJECTED', ts, received_at: ts, machine_known: true });
}

describe('estimated stock', () => {
  let ctx;
  let other;
  const as = {};
  const stock = async (who = 'owner', id = 'DEV00001') =>
    Object.fromEntries((await as[who].get(`${M}/${id}/stock`)).body.items.map((r) => [r.hopper, r]));
  const refill = (hopper, level) => as.owner.post(`${M}/DEV00001/stock/refills`, { hopper, level_g: level });

  before(async () => { ctx = await startServer(); });
  after(async () => { await ctx.stop(); });
  beforeEach(async () => {
    await ctx.reset();
    await importConfig({ tenantId: 'powerfuel', tenantName: 'PowerFuel Gym', machineId: 'DEV00001', config: mockConfig() });
    other = (await importConfig({ tenantId: 'powerfuel', config: mockConfig() })).machine._id;
    for (const [pid, g] of [['guava', 32.5], ['chocolate', 40], ['vanilla', 30], ['cookie', 30], ['coffee', 30]]) {
      await Product.updateOne({ tenant_id: 'powerfuel', product_id: pid }, { portion_g: g });
    }
    const users = {
      ops: { email: 'ops@x.io', role: 'platform_admin' },
      owner: { email: 'owner@x.io', role: 'tenant_admin', tenant_id: 'powerfuel' },
      opOne: { email: 'op1@x.io', role: 'operator', tenant_id: 'powerfuel', machines: ['DEV00001'] },
      viewer: { email: 'v@x.io', role: 'viewer', tenant_id: 'powerfuel' },
    };
    for (const [key, fields] of Object.entries(users)) {
      await makeUser(fields);
      as[key] = await signIn(ctx.app, fields.email);
    }
  });

  it('counts only cycles that dosed this hopper on this machine after the refill', async () => {
    await cycle(1, { ts: new Date(Date.now() - 3600 * 1000) });   // before the refill
    await refill(1, 2000);
    await cycle(1);
    await cycle(1);
    await cycle(1);
    await cycle(1, { dosed: false });   // failed before dosing
    await cycle(2);                     // another hopper
    await cycle(1, { machine: other }); // another machine
    const guava = (await stock())[1];
    assert.equal(guava.doses_since, 3);
    assert.equal(guava.left_g, 2000 - 3 * 32.5);
    assert.equal(guava.portions_left, 58);
    assert.equal(guava.state, 'ok');
    assert.equal(guava.days_left, 101.5, '58 portions ÷ (4 doses in 7 days ÷ 7)');
    assert.equal(guava.last_refill.by, 'owner@x.io');
  });

  it('states: low, empty, unknown, not estimated, refill needed', async () => {
    await refill(2, 100);
    await cycle(2);                  // chocolate: 60 g → 1 portion ≤ 15 → low
    await refill(5, 50);
    await cycle(5);
    await cycle(5);                  // cookie: 50 − 60 → 0 → empty (never negative)
    await refill(6, 900);            // coffee, then the hopper gets another product
    await as.owner.post('/api/v1/tenants/powerfuel/products', { product_id: 'mango', name: 'Mango', actual_price: 120,
      image: 'res://assets/images/flavors/prymor_guava.png', portion_g: 30 });
    const menu = (await Machine.findById('DEV00001').lean()).menu
      .map((i) => (i.hopper === 6 ? { ...i, product_id: 'mango' } : i));
    await as.owner.put(`${M}/DEV00001/menu`, { menu }).set('If-Match', String((await Machine.findById('DEV00001')).menu_version));
    const s = await stock();
    assert.equal(s[2].state, 'low');
    assert.equal(s[2].portions_left, 1);
    assert.equal(s[5].state, 'empty');
    assert.equal(s[5].left_g, 0);
    assert.equal(s[4].state, 'unknown', 'vanilla never refilled');
    assert.equal(s[3].state, 'not_estimated', 'electro has no portion size');
    assert.equal(s[6].state, 'refill_needed', 'hopper 6 now holds mango, refilled as coffee');
    assert.equal(s[6].portions_left, null);
  });

  it('an adjustment resets the level; a per-hopper threshold overrides the default', async () => {
    await refill(1, 2000);
    await cycle(1);
    await as.owner.post(`${M}/DEV00001/stock/adjustments`, { hopper: 1, level_g: 650 });   // weighed: 20 portions
    let guava = (await stock())[1];
    assert.equal(guava.doses_since, 0);
    assert.equal(guava.portions_left, 20);
    assert.equal(guava.state, 'ok');
    await as.owner.patch(`${M}/DEV00001/menu/guava`, { low_portions: 25 })
      .set('If-Match', String((await Machine.findById('DEV00001')).menu_version));
    guava = (await stock())[1];
    assert.equal(guava.low_portions, 25);
    assert.equal(guava.state, 'low');
  });

  it('fleet list: what needs attention, most urgent first, scoped to the caller', async () => {
    await refill(1, 2000);
    await refill(2, 100);
    await cycle(2);
    await refill(5, 20);
    const all = await as.owner.get('/api/v1/stock');
    assert.equal(all.status, 200);
    assert.deepEqual(all.body.items.slice(0, 2).map((r) => [r.machine_id, r.hopper, r.state]),
      [['DEV00001', 5, 'empty'], ['DEV00001', 2, 'low']]);
    assert.ok(!all.body.items.some((r) => r.state === 'ok'), 'ok hoppers left out by default');
    assert.ok(all.body.items.some((r) => r.machine_id === other && r.state === 'unknown'));
    const low = await as.owner.get('/api/v1/stock?state=low');
    assert.deepEqual(low.body.items.map((r) => r.hopper), [2]);
    const limited = await as.opOne.get('/api/v1/stock');
    assert.ok(limited.body.items.every((r) => r.machine_id === 'DEV00001'));
    assert.equal((await as.owner.get('/api/v1/stock?state=nearly')).body.error, 'invalid_state');
    const fresh = (await as.owner.post(M, { name: 'New' })).body.machine.id;
    assert.ok(!(await as.ops.get('/api/v1/stock')).body.items.some((r) => r.machine_id === fresh), 'not configured: skipped');
  });

  it('every tenant role reads stock for its machines; others get 404', async () => {
    assert.equal((await as.viewer.get(`${M}/DEV00001/stock`)).status, 200);
    assert.equal((await as.opOne.get(`${M}/${other}/stock`)).status, 404);
  });
  it('fleet stock tenant filter', async () => {
    const globex = (await importConfig({ tenantId: 'globex', tenantName: 'Globex', config: mockConfig() })).machine._id;
    const machinesOf = async (who, q) => {
      const res = await as[who].get(`/api/v1/stock${q}`);
      assert.equal(res.status, 200, `${who} ${q}`);
      return new Set(res.body.items.map((r) => r.machine_id));
    };
    assert.ok((await machinesOf('ops', '')).has(globex));
    const pf = await machinesOf('ops', '?tenant=powerfuel');
    assert.deepEqual([...pf].sort(), ['DEV00001', other].sort());
    assert.deepEqual([...(await machinesOf('ops', '?tenant=globex'))], [globex]);
    assert.deepEqual((await as.ops.get('/api/v1/stock?tenant=nosuch')).body, { items: [] });
    assert.equal((await machinesOf('owner', '?tenant=powerfuel')).size, 2);
    for (const who of ['owner', 'opOne', 'viewer']) {
      const res = await as[who].get('/api/v1/stock?tenant=globex');
      assert.equal(res.status, 404, who);
      assert.equal(res.body.error, 'not_found');
    }
    assert.deepEqual([...(await machinesOf('opOne', '?tenant=powerfuel'))], ['DEV00001']);
  });
});
