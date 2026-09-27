import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { makeUser, signIn, startServer } from './helpers.js';
import { AuditEntry, Machine, Tenant } from '../src/models/index.js';
import { createMachine, generateMachineId, MACHINE_ID_PATTERN } from '../src/services/machines.js';
import { checkBody, checkVersion, required, T } from '../src/catalog/input.js';

describe('machine ids', () => {
  it('are 8 characters from A–Z0–9 and vary', () => {
    const ids = new Set(Array.from({ length: 500 }, generateMachineId));
    assert.ok([...ids].every((id) => MACHINE_ID_PATTERN.test(id)));
    assert.ok(ids.size > 495);
  });
});

describe('input checks', () => {
  it('reports every unknown field and wrong type at once', () => {
    assert.throws(() => checkBody({ name: 5, extra: 1 }, { id: required(T.slug()), name: T.string(10) }), (e) => {
      assert.equal(e.status, 400);
      assert.equal(e.message, 'invalid_body');
      assert.deepEqual(e.details.map((d) => d.field).sort(), ['extra', 'id', 'name']);
      return true;
    });
    assert.throws(() => checkBody([], {}), /invalid_body/);
    assert.deepEqual(checkBody({ id: 'ok-1' }, { id: required(T.slug()) }), { id: 'ok-1' });
  });

  it('prices are whole rupees; nested objects and lists are checked', () => {
    assert.equal(T.rupees()(75), null);
    for (const bad of [0, -1, 7.5, '75', null]) assert.ok(T.rupees()(bad));
    const nested = T.object({ a: T.bool() })({ a: 1, b: 2 });
    assert.match(nested, /a: true or false/);
    assert.match(nested, /b: unknown field/);
    assert.match(T.list(T.rupees())([1, 'x']), /\[1\]/);
  });

  it('If-Match: missing 428, stale 409 with the current version', () => {
    const req = (v) => ({ get: () => v });
    assert.throws(() => checkVersion(req(undefined), 3), (e) => e.status === 428 && e.message === 'if_match_required');
    assert.throws(() => checkVersion(req('2'), 3), (e) => e.status === 409 && e.details.current === 3);
    checkVersion(req('"3"'), 3);
    checkVersion(req('W/"3"'), 3);
  });
});

describe('/api/v1/tenants', () => {
  let ctx;
  let ops;
  let owner;
  let viewer;

  before(async () => { ctx = await startServer(); });
  after(async () => { await ctx.stop(); });
  beforeEach(async () => {
    await ctx.reset();
    await Tenant.create([{ _id: 'powerfuel', name: 'PowerFuel Gym', branding: { display_name: 'PowerFuel Gym' } },
      { _id: 'globex', name: 'Globex' }]);
    await makeUser({ email: 'ops@fuelbot.example', role: 'platform_admin' });
    await makeUser({ email: 'owner@powerfuel.example', role: 'tenant_admin', tenant_id: 'powerfuel' });
    await makeUser({ email: 'v@powerfuel.example', role: 'viewer', tenant_id: 'powerfuel' });
    ops = await signIn(ctx.app, 'ops@fuelbot.example');
    owner = await signIn(ctx.app, 'owner@powerfuel.example');
    viewer = await signIn(ctx.app, 'v@powerfuel.example');
  });

  it('platform lists every tenant; others only their own', async () => {
    await createMachine({ tenant_id: 'powerfuel', name: 'Bay 1' });
    const all = await ops.get('/api/v1/tenants');
    assert.deepEqual(all.body.items.map((t) => [t.id, t.machine_count]), [['globex', 0], ['powerfuel', 1]]);
    const mine = await viewer.get('/api/v1/tenants');
    assert.deepEqual(mine.body.items.map((t) => t.id), ['powerfuel']);
    assert.equal((await owner.get('/api/v1/tenants/globex')).status, 404);
    assert.equal((await viewer.get('/api/v1/tenants/powerfuel')).body.tenant.name, 'PowerFuel Gym');
  });

  it('only platform creates tenants; ids are slugs and unique', async () => {
    let res = await ops.post('/api/v1/tenants', { id: 'acme', name: 'Acme Fitness', branding: { logo_text: 'AF' } });
    assert.equal(res.status, 201);
    assert.equal(res.body.tenant.branding.logo_text, 'AF');
    assert.equal((await ops.post('/api/v1/tenants', { id: 'acme', name: 'Again' })).body.error, 'tenant_exists');
    res = await ops.post('/api/v1/tenants', { id: 'Bad Id', name: '' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body.details.map((d) => d.field).sort(), ['id', 'name']);
    assert.equal((await owner.post('/api/v1/tenants', { id: 'mine', name: 'Mine' })).status, 403);
    assert.equal((await AuditEntry.findOne({ action: 'tenant.create' })).tenant_id, 'acme');
  });

  it('a tenant_admin edits name and branding (bumping catalog_version); only platform disables', async () => {
    const res = await owner.patch('/api/v1/tenants/powerfuel', { branding: { logo_text: 'PF' } });
    assert.equal(res.status, 200);
    assert.equal(res.body.tenant.branding.display_name, 'PowerFuel Gym', 'merged, not replaced');
    assert.equal(res.body.tenant.branding.logo_text, 'PF');
    assert.equal(res.body.tenant.catalog_version, 1);
    assert.equal((await owner.patch('/api/v1/tenants/powerfuel', { disabled: true })).status, 403);
    assert.equal((await viewer.patch('/api/v1/tenants/powerfuel', { name: 'X' })).status, 403);
    assert.equal((await owner.patch('/api/v1/tenants/powerfuel', { branding: { logo_text: 'TOOLONG' } })).status, 400);
    assert.equal((await ops.patch('/api/v1/tenants/powerfuel', { disabled: true })).body.tenant.disabled, true);
    const entry = await AuditEntry.findOne({ action: 'tenant.update' }).sort({ at: 1 }).lean();
    assert.deepEqual(entry.after, { branding: { display_name: 'PowerFuel Gym', logo_text: 'PF', support_phone: null } });
  });
});

describe('a just-registered machine', () => {
  let ctx;
  before(async () => { ctx = await startServer(); });
  after(async () => { await ctx.stop(); });

  it('exists with the default base and answers 409 machine_not_configured to the kiosk', async () => {
    await Tenant.create({ _id: 'powerfuel', name: 'PowerFuel Gym' });
    const machine = await createMachine({ tenant_id: 'powerfuel', name: 'Bay 1' });
    assert.match(machine._id, MACHINE_ID_PATTERN);
    assert.deepEqual(machine.bases.map((b) => b.id), ['water']);
    const res = await request(ctx.app).get('/fuelbot/config')
      .set({ 'X-Tenant-Id': 'powerfuel', 'X-Machine-Id': machine._id });
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'machine_not_configured');
  });

  it('retries on an id clash', async () => {
    await Tenant.create({ _id: 't2', name: 'T2' }).catch(() => {});
    const ids = ['CLASH001', 'CLASH001', 'FRESH002'];
    await createMachine({ tenant_id: 't2' }, { idSource: () => 'CLASH001' });
    const second = await createMachine({ tenant_id: 't2' }, { idSource: () => ids.shift() });
    assert.equal(second._id, 'FRESH002');
    assert.equal(await Machine.countDocuments({ tenant_id: 't2' }), 2);
  });
});
