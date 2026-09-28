import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, mockConfig, signIn, startServer } from './helpers.js';
import { AuditEntry, Machine, Product } from '../src/models/index.js';
import { importConfig } from '../src/services/catalog.js';

const P = '/api/v1/tenants/powerfuel/products';
const M = '/api/v1/tenants/powerfuel/machines';

describe('stock inputs', () => {
  let ctx;
  let other;
  const as = {};
  const rev = async (pid) => String((await Product.findOne({ product_id: pid })).rev);
  const ver = async (id = 'DEV00001') => String((await Machine.findById(id)).menu_version);

  before(async () => { ctx = await startServer(); });
  after(async () => { await ctx.stop(); });
  beforeEach(async () => {
    await ctx.reset();
    await importConfig({ tenantId: 'powerfuel', tenantName: 'PowerFuel Gym', machineId: 'DEV00001', config: mockConfig() });
    other = (await importConfig({ tenantId: 'powerfuel', config: mockConfig() })).machine._id;
    const users = {
      ops: { email: 'ops@x.io', role: 'platform_admin' },
      owner: { email: 'owner@x.io', role: 'tenant_admin', tenant_id: 'powerfuel' },
      op: { email: 'op@x.io', role: 'operator', tenant_id: 'powerfuel' },
      opOne: { email: 'op1@x.io', role: 'operator', tenant_id: 'powerfuel', machines: ['DEV00001'] },
      viewer: { email: 'v@x.io', role: 'viewer', tenant_id: 'powerfuel' },
    };
    for (const [key, fields] of Object.entries(users)) {
      await makeUser(fields);
      as[key] = await signIn(ctx.app, fields.email);
    }
  });

  it('portion size: tenant_admin and platform set it; operators may send it unchanged only', async () => {
    let res = await as.owner.patch(`${P}/guava`, { portion_g: 32.5 }).set('If-Match', await rev('guava'));
    assert.equal(res.status, 200);
    assert.equal(res.body.product.portion_g, 32.5);
    res = await as.op.patch(`${P}/guava`, { portion_g: 30 }).set('If-Match', await rev('guava'));
    assert.equal(res.status, 403);
    assert.equal(res.body.error, 'forbidden_field');
    assert.equal((await as.op.patch(`${P}/guava`, { name: 'G', portion_g: 32.5 }).set('If-Match', await rev('guava'))).status, 200);
    for (const bad of [0, 600, '32']) {
      assert.equal((await as.owner.patch(`${P}/guava`, { portion_g: bad }).set('If-Match', await rev('guava'))).status, 400);
    }
    assert.equal((await as.ops.patch(`${P}/chocolate`, { portion_g: 40 }).set('If-Match', await rev('chocolate'))).status, 200);
    res = await as.owner.patch(`${P}/guava`, { portion_g: null }).set('If-Match', await rev('guava'));
    assert.equal(res.body.product.portion_g, null);
  });

  it('low-stock threshold per menu item: stock:write only; other edits keep it', async () => {
    let res = await as.owner.patch(`${M}/DEV00001/menu/guava`, { low_portions: 20 }).set('If-Match', await ver());
    assert.equal(res.status, 200);
    assert.equal(res.body.machine.menu[0].low_portions, 20);
    res = await as.op.patch(`${M}/DEV00001/menu/guava`, { low_portions: 5 }).set('If-Match', await ver());
    assert.equal(res.body.error, 'forbidden_field');
    res = await as.op.patch(`${M}/DEV00001/menu/guava`, { sold_out: true }).set('If-Match', await ver());
    assert.equal(res.status, 200);
    assert.equal(res.body.machine.menu[0].low_portions, 20, 'kept');
  });

  it('refills and adjustments: tenant_admin and platform only, for a hopper on the menu', async () => {
    let res = await as.owner.post(`${M}/DEV00001/stock/refills`, { hopper: 1, level_g: 2000, note: 'new tub' });
    assert.equal(res.status, 201);
    assert.deepEqual([res.body.event.kind, res.body.event.product_id, res.body.event.level_g], ['refill', 'guava', 2000]);
    res = await as.ops.post(`${M}/DEV00001/stock/adjustments`, { hopper: 1, level_g: 1800 });
    assert.equal(res.body.event.kind, 'adjust');
    assert.equal((await as.op.post(`${M}/DEV00001/stock/refills`, { hopper: 1, level_g: 2000 })).status, 403);
    assert.equal((await as.viewer.post(`${M}/DEV00001/stock/refills`, { hopper: 1, level_g: 2000 })).status, 403);
    assert.equal((await as.owner.post(`${M}/DEV00001/stock/refills`, { hopper: 7, level_g: 1 })).status, 400);
    assert.equal((await as.owner.post(`${M}/DEV00001/stock/refills`, { hopper: 1, level_g: -5 })).status, 400);
    const menu = (await Machine.findById('DEV00001').lean()).menu.filter((i) => i.hopper !== 6);
    await as.owner.put(`${M}/DEV00001/menu`, { menu }).set('If-Match', await ver());
    res = await as.owner.post(`${M}/DEV00001/stock/refills`, { hopper: 6, level_g: 1000 });
    assert.equal(res.status, 400, 'hopper 6 is no longer on the menu');
    const audited = await AuditEntry.find({ action: /^stock\./ }).sort({ at: 1 }).lean();
    assert.deepEqual(audited.map((a) => [a.action, a.target]), [['stock.refill', 'hopper:1'], ['stock.adjust', 'hopper:1']]);
  });

  it('history: newest first, by hopper; members of the machine only', async () => {
    await as.owner.post(`${M}/DEV00001/stock/refills`, { hopper: 1, level_g: 2000 });
    await as.owner.post(`${M}/DEV00001/stock/refills`, { hopper: 2, level_g: 1500 });
    await as.owner.post(`${M}/DEV00001/stock/adjustments`, { hopper: 1, level_g: 1900 });
    const all = await as.viewer.get(`${M}/DEV00001/stock/history`);
    assert.deepEqual(all.body.items.map((e) => [e.hopper, e.kind]), [[1, 'adjust'], [2, 'refill'], [1, 'refill']]);
    const one = await as.viewer.get(`${M}/DEV00001/stock/history?hopper=2`);
    assert.deepEqual(one.body.items.map((e) => e.level_g), [1500]);
    assert.equal((await as.opOne.get(`${M}/${other}/stock/history`)).status, 404);
  });
});
