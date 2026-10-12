import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { makeUser, mockConfig, signIn, startServer } from './helpers.js';
import { AuditEntry, Machine, Product, Tenant } from '../src/models/index.js';
import { importConfig } from '../src/services/catalog.js';

const M = '/api/v1/tenants/powerfuel/machines';

describe('menus', () => {
  let ctx;
  let other;
  const as = {};
  const v = async (id) => String((await Machine.findById(id)).menu_version);
  const kiosk = (id = 'DEV00001') => request(ctx.app).get('/fuelbot/config')
    .set({ 'X-Tenant-Id': 'powerfuel', 'X-Machine-Id': id });
  const menuOf = async (id) => (await Machine.findById(id).lean()).menu.map(({ product_id: p, hopper, enabled,
    sold_out: s, badge, price }) => ({ product_id: p, hopper, enabled, sold_out: s, badge, ...(price ? { price } : {}) }));

  before(async () => { ctx = await startServer(); });
  after(async () => { await ctx.stop(); });
  beforeEach(async () => {
    await ctx.reset();
    await importConfig({ tenantId: 'powerfuel', tenantName: 'PowerFuel Gym', machineId: 'DEV00001', config: mockConfig() });
    other = (await importConfig({ tenantId: 'powerfuel', config: mockConfig() })).machine._id;
    await Tenant.create({ _id: 'globex', name: 'Globex' });
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

  it('PUT replaces the menu: order, hoppers and overrides reach the kiosk', async () => {
    const menu = (await menuOf('DEV00001')).reverse();
    menu[0].price = { actual_price: 150, offer_price: 140 };   // coffee, now first
    const res = await as.owner.put(`${M}/DEV00001/menu`, { menu }).set('If-Match', await v('DEV00001'));
    assert.equal(res.status, 200);
    const cfg = (await kiosk()).body;
    assert.deepEqual(cfg.flavors.map((f) => f.id), ['coffee', 'cookie', 'vanilla', 'electro', 'chocolate', 'guava']);
    assert.equal(cfg.flavors[0].actual_price, 150);
    assert.equal(cfg.flavors[0].offer_price, 140);
    assert.equal(cfg.flavors[1].actual_price, 160, 'no override: the product price');
    assert.equal((await AuditEntry.countDocuments({ action: 'menu.update' })), 1);
  });

  it('operators toggle sold out and hoppers, never prices; viewers and other machines are refused', async () => {
    const patch = (who, pid, body, id = 'DEV00001') => as[who].patch(`${M}/${id}/menu/${pid}`, body);
    let res = await patch('op', 'vanilla', { sold_out: false }).set('If-Match', await v('DEV00001'));
    assert.equal(res.status, 200);
    assert.equal((await kiosk()).body.flavors.find((f) => f.id === 'vanilla').sold_out, false);
    res = await patch('op', 'guava', { price: { actual_price: 80, offer_price: null } }).set('If-Match', await v('DEV00001'));
    assert.equal(res.status, 403);
    assert.equal(res.body.error, 'forbidden_field');
    res = await as.op.put(`${M}/DEV00001/menu`, { menu: await menuOf('DEV00001') }).set('If-Match', await v('DEV00001'));
    assert.equal(res.status, 200, 'the same prices are fine');
    assert.equal((await patch('opOne', 'guava', { sold_out: true }, other).set('If-Match', await v(other))).status, 404);
    assert.equal((await patch('opOne', 'guava', { sold_out: true }).set('If-Match', await v('DEV00001'))).status, 200);
    assert.equal((await patch('viewer', 'guava', { sold_out: true }).set('If-Match', await v('DEV00001'))).status, 403);
    assert.equal((await patch('owner', 'ghost', { sold_out: true }).set('If-Match', await v('DEV00001'))).status, 404);
  });

  it('owner sets and clears a price override', async () => {
    const patch = async (body) => as.owner.patch(`${M}/DEV00001/menu/guava`, body).set('If-Match', await v('DEV00001'));
    await patch({ price: { actual_price: 85, offer_price: null } });
    assert.equal((await kiosk()).body.flavors[0].actual_price, 85);
    await patch({ price: null });
    const guava = (await kiosk()).body.flavors[0];
    assert.deepEqual([guava.actual_price, guava.offer_price], [90, 75]);
  });

  it('refuses unknown, archived or repeated products, an empty menu, and what the app would reject', async () => {
    const put = async (menu) => as.owner.put(`${M}/DEV00001/menu`, { menu }).set('If-Match', await v('DEV00001'));
    await Product.create({ tenant_id: 'powerfuel', product_id: 'old', name: 'Old', actual_price: 50, archived: true });
    let res = await put([{ product_id: 'ghost', hopper: 1 }, { product_id: 'old', hopper: 2 }, { product_id: 'ghost', hopper: 3 }]);
    assert.equal(res.status, 400);
    assert.deepEqual(res.body.details.map((d) => d.error), ['no such product', 'archived', 'no such product', 'listed twice']);
    assert.equal((await put([])).status, 400);
    assert.equal((await put([{ product_id: 'guava' }])).status, 400, 'hopper required');
    res = await put([{ product_id: 'guava', hopper: 1 }, { product_id: 'chocolate', hopper: 1 }]);
    assert.equal(res.status, 422);
    assert.deepEqual(res.body.details[0].errors, ['chocolate: hopper 1 already used by guava']);
  });

  it('If-Match is required and must be current', async () => {
    const menu = await menuOf('DEV00001');
    assert.equal((await as.owner.put(`${M}/DEV00001/menu`, { menu })).status, 428);
    assert.equal((await as.owner.put(`${M}/DEV00001/menu`, { menu }).set('If-Match', '0')).status, 409);
  });

  it('copies a menu onto a new machine, which the kiosk can then load', async () => {
    const fresh = (await as.owner.post(M, { name: 'Bay 3' })).body.machine.id;
    assert.equal((await kiosk(fresh)).status, 409);
    await as.owner.patch(`${M}/DEV00001/menu/guava`, { price: { actual_price: 85, offer_price: null } })
      .set('If-Match', await v('DEV00001'));
    const res = await as.owner.post(`${M}/${fresh}/menu/copy-from/DEV00001`).set('If-Match', await v(fresh));
    assert.equal(res.status, 200);
    const cfg = await kiosk(fresh);
    assert.equal(cfg.status, 200);
    assert.equal(cfg.body.flavors[0].actual_price, 85, 'override copied');

    const fresh2 = (await as.owner.post(M, { name: 'Bay 4' })).body.machine.id;
    assert.equal((await as.op.post(`${M}/${fresh2}/menu/copy-from/DEV00001`).set('If-Match', await v(fresh2))).body.error,
      'forbidden_field', 'the override would change a price');
    assert.equal((await as.op.post(`${M}/${fresh2}/menu/copy-from/${other}`).set('If-Match', await v(fresh2))).status, 200);
    assert.equal((await as.owner.post(`${M}/${fresh2}/menu/copy-from/NOPE0000`).set('If-Match', await v(fresh2))).status, 404);
  });

  it('a filled menu cannot be emptied, even directly on the model', async () => {
    const machine = await Machine.findById('DEV00001');
    machine.menu = [];
    await assert.rejects(machine.save(), (e) => e.details?.[0].errors.includes('flavors must be a non-empty array'));
  });
});

describe('/api/v1/unregistered', () => {
  let ctx;
  before(async () => { ctx = await startServer(); });
  after(async () => { await ctx.stop(); });

  it('lists ids seen on ingest but not registered to that tenant (platform only)', async () => {
    await importConfig({ tenantId: 'powerfuel', machineId: 'DEV00001', config: mockConfig() });
    await makeUser({ email: 'ops@x.io', role: 'platform_admin' });
    await makeUser({ email: 'owner@x.io', role: 'tenant_admin', tenant_id: 'powerfuel' });
    const post = (tenant, machine, body) => request(ctx.app).post('/fuelbot/sales')
      .set({ 'X-Tenant-Id': tenant, 'X-Machine-Id': machine }).send(body);
    await post('powerfuel', 'TYPO0001', { order_id: 'o1' });
    await post('powerfuel', 'TYPO0001', { order_id: 'o2' });
    await post('globex', 'DEV00001', { order_id: 'o3' });   // right id, wrong tenant
    await post('powerfuel', 'DEV00001', { order_id: 'o4' });   // registered: not listed
    const ops = await signIn(ctx.app, 'ops@x.io');
    const res = await ops.get('/api/v1/unregistered');
    assert.equal(res.status, 200);
    const rows = Object.fromEntries(res.body.items.map((r) => [`${r.tenant_id}/${r.machine_id}`, r]));
    assert.deepEqual(Object.keys(rows).sort(), ['globex/DEV00001', 'powerfuel/TYPO0001']);
    assert.equal(rows['powerfuel/TYPO0001'].sales, 2);
    assert.equal(rows['powerfuel/TYPO0001'].registered_under, null);
    assert.equal(rows['globex/DEV00001'].registered_under, 'powerfuel');
    assert.equal((await (await signIn(ctx.app, 'owner@x.io')).get('/api/v1/unregistered')).status, 403);
  });
});
