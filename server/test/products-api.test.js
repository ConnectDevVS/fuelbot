import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { makeUser, mockConfig, signIn, startServer } from './helpers.js';
import { AuditEntry, Product, Tenant } from '../src/models/index.js';
import { importConfig } from '../src/services/catalog.js';

const URL = '/api/v1/tenants/powerfuel/products';

describe('/api/v1/tenants/:tid/products', () => {
  let ctx;
  let other;   // a second machine with the same menu
  const as = {};

  const configVersion = async (machine = 'DEV00001') => (await request(ctx.app).get('/fuelbot/config')
    .set({ 'X-Tenant-Id': 'powerfuel', 'X-Machine-Id': machine })).body.version;
  const patch = (who, pid, body, rev) => {
    const r = as[who].patch(`${URL}/${pid}`, body);
    return rev === undefined ? r : r.set('If-Match', String(rev));
  };
  const rev = async (pid) => (await Product.findOne({ product_id: pid })).rev;

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
      boss: { email: 'boss@x.io', role: 'tenant_admin', tenant_id: 'globex' },
    };
    for (const [key, fields] of Object.entries(users)) {
      await makeUser(fields);
      as[key] = await signIn(ctx.app, fields.email);
    }
  });

  it('lists products with the machines using them, limited to what the caller may see', async () => {
    const res = await as.owner.get(URL);
    assert.equal(res.status, 200);
    assert.equal(res.body.items.length, 6);
    const guava = res.body.items.find((p) => p.id === 'guava');
    assert.deepEqual(guava.machines.sort(), ['DEV00001', other].sort());
    assert.equal(guava.actual_price, 90);
    assert.equal(guava.offer_price, 75);
    const limited = await as.opOne.get(URL);
    assert.deepEqual(limited.body.items.find((p) => p.id === 'guava').machines, ['DEV00001']);
    assert.equal((await as.boss.get(URL)).status, 404, 'another tenant');
    assert.equal((await as.viewer.get(`${URL}/guava`)).body.product.name, 'Prymor Guava');
    assert.equal((await as.viewer.get(`${URL}/nope`)).status, 404);
  });

  it('tenant_admin creates products; operators cannot; ids are unique; bodies are checked', async () => {
    const body = { product_id: 'mango', name: 'Mango Whey', actual_price: 120, offer_price: null,
      ingredients: ['Whey', 'Mango'], image: 'res://assets/images/flavors/prymor_guava.png' };
    let res = await as.owner.post(URL, body);
    assert.equal(res.status, 201);
    assert.equal(res.body.product.rev, 1);
    assert.deepEqual(res.body.product.machines, []);
    assert.equal((await as.owner.post(URL, body)).body.error, 'product_exists');
    assert.equal((await as.op.post(URL, { ...body, product_id: 'kiwi' })).status, 403);
    res = await as.owner.post(URL, { product_id: 'Bad Id', name: 'x', actual_price: 7.5, image_url: 'https://x/y.png' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body.details.map((d) => d.field).sort(), ['actual_price', 'image_url', 'product_id']);
    assert.equal((await AuditEntry.findOne({ action: 'product.create' })).target, 'product:mango');
  });

  it('updates need If-Match: missing 428, stale 409; a change bumps rev and every machine\'s version', async () => {
    assert.equal((await patch('owner', 'guava', { name: 'Guava Blast' })).status, 428);
    const stale = await patch('owner', 'guava', { name: 'Guava Blast' }, 99);
    assert.equal(stale.status, 409);
    assert.equal(stale.body.details.current, await rev('guava'));
    const v1 = await configVersion(other);
    const res = await patch('owner', 'guava', { name: 'Guava Blast', actual_price: 95 }, await rev('guava'));
    assert.equal(res.status, 200);
    assert.equal(res.body.product.name, 'Guava Blast');
    assert.ok(await configVersion(other) > v1);
    const entry = await AuditEntry.findOne({ action: 'product.update' }).lean();
    assert.deepEqual(entry.before, { name: 'Prymor Guava', actual_price: 90 });
    assert.deepEqual(entry.after, { name: 'Guava Blast', actual_price: 95 });
  });

  it('operators edit text but never prices; one limited to some machines edits nothing', async () => {
    let res = await patch('op', 'guava', { offer_price: 70 }, await rev('guava'));
    assert.equal(res.status, 403);
    assert.equal(res.body.error, 'forbidden_field');
    res = await patch('op', 'guava', { name: 'Guava!', actual_price: 90, offer_price: 75 }, await rev('guava'));
    assert.equal(res.status, 200, 'unchanged prices are fine');
    assert.equal((await patch('opOne', 'guava', { name: 'x' }, await rev('guava'))).status, 403);
    assert.equal((await patch('viewer', 'guava', { name: 'x' }, await rev('guava'))).status, 403);
  });

  it('a change that would break a machine is refused, naming every such machine', async () => {
    await Product.updateOne({ product_id: 'guava' }, { $unset: { image_url: 1 } });
    const res = await patch('owner', 'guava', { image: null }, await rev('guava'));
    assert.equal(res.status, 422);
    assert.equal(res.body.error, 'invalid_config');
    assert.deepEqual(res.body.details.map((d) => d.machine_id).sort(), ['DEV00001', other].sort());
    assert.deepEqual(res.body.details[0].errors, ['guava: image or image_url required']);
    assert.ok((await Product.findOne({ product_id: 'guava' })).image, 'nothing saved');
  });

  it('archiving: refused while on a menu; hidden from the list unless asked for', async () => {
    assert.equal((await patch('owner', 'guava', { archived: true }, await rev('guava'))).body.error, 'product_in_use');
    await as.owner.post(URL, { product_id: 'mango', name: 'Mango', actual_price: 120 });
    assert.equal((await patch('owner', 'mango', { archived: true }, 1)).status, 200);
    assert.ok(!(await as.owner.get(URL)).body.items.some((p) => p.id === 'mango'));
    assert.ok((await as.owner.get(`${URL}?archived=true`)).body.items.some((p) => p.id === 'mango' && p.archived));
  });
});
