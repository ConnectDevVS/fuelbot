import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import request from 'supertest';
import { makeUser, mockConfig, signIn, startServer } from './helpers.js';
import { AuditEntry, Machine, MachineKey, Sale } from '../src/models/index.js';
import { importConfig } from '../src/services/catalog.js';
import { DEV_KEY, generateKey, hashKey, normaliseKey } from '../src/services/keys.js';

const run = promisify(execFile);
const SERVER_DIR = new URL('..', import.meta.url).pathname;
const KEYS = '/api/v1/tenants/powerfuel/machines/DEV00001/keys';

describe('key format', () => {
  it('20 characters in groups of 4, no look-alikes; typing variations match', () => {
    for (let i = 0; i < 200; i += 1) {
      const key = generateKey();
      assert.match(key, /^([A-HJKMNP-Z2-9]{4}-){4}[A-HJKMNP-Z2-9]{4}$/);
      assert.doesNotMatch(key, /[01OIL]/);
    }
    const key = '7KQM-2XPA-9TRD-4WZC-HN3B';
    assert.equal(normaliseKey(' 7kqm 2xpa-9trd 4wzc-hn3b\n'), '7KQM2XPA9TRD4WZCHN3B');
    assert.equal(hashKey('7kqm2xpa9trd4wzchn3b'), hashKey(key));
  });
});

describe('machine keys', () => {
  let ctx;
  let other;
  const as = {};
  const kiosk = (key, machine = 'DEV00001', path = '/fuelbot/config') => {
    const r = request(ctx.app).get(path).set({ 'X-Tenant-Id': 'powerfuel', 'X-Machine-Id': machine });
    return key === undefined ? r : r.set('Authorization', `Bearer ${key}`);
  };
  const mode = (m) => { ctx.settings.machineAuth = m; };
  const issue = async (machine = 'DEV00001', label = 'bay') =>
    (await as.owner.post(`/api/v1/tenants/powerfuel/machines/${machine}/keys`, { label })).body;

  before(async () => { ctx = await startServer(); });
  after(async () => { await ctx.stop(); });
  beforeEach(async () => {
    await ctx.reset();
    mode('required');
    await importConfig({ tenantId: 'powerfuel', tenantName: 'PowerFuel Gym', machineId: 'DEV00001', config: mockConfig() });
    other = (await importConfig({ tenantId: 'powerfuel', config: mockConfig() })).machine._id;
    await makeUser({ email: 'owner@x.io', role: 'tenant_admin', tenant_id: 'powerfuel' });
    await makeUser({ email: 'op@x.io', role: 'operator', tenant_id: 'powerfuel' });
    as.owner = await signIn(ctx.app, 'owner@x.io');
    as.op = await signIn(ctx.app, 'op@x.io');
  });

  it('a tenant_admin issues a key, shown once; lists never show it', async () => {
    const res = await issue();
    assert.match(res.key, /^([A-Z2-9]{4}-){4}[A-Z2-9]{4}$/);
    assert.equal(res.machine_key.prefix, normaliseKey(res.key).slice(0, 4));
    const list = await as.owner.get(KEYS);
    assert.equal(list.body.items.length, 1);
    const text = JSON.stringify(list.body);
    assert.ok(!text.includes(normaliseKey(res.key)) && !text.includes(res.key) && !text.includes('hash'));
    assert.equal((await as.op.post(KEYS, {})).status, 403);
    assert.equal((await as.op.get(KEYS)).status, 403);
    const audited = JSON.stringify(await AuditEntry.find({ action: 'key.issue' }).lean());
    assert.ok(audited.includes(res.machine_key.prefix) && !audited.includes(normaliseKey(res.key)));
  });

  it('required: no key 401, the right key (however typed) 200, a wrong or foreign key 401', async () => {
    const { key } = await issue();
    const { key: otherKey } = await issue(other);
    let res = await kiosk();
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'machine_key_required');
    assert.equal((await kiosk(key)).status, 200);
    assert.equal((await kiosk(key.toLowerCase().replaceAll('-', ' '))).status, 200);
    res = await kiosk('AAAA-BBBB-CCCC-DDDD-EEEE');
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'machine_key_invalid');
    assert.equal((await kiosk(otherKey)).status, 401, 'another machine\'s key');
    assert.equal((await kiosk(key, 'TYPO0001')).status, 401, 'unregistered machine');
    const sale = await request(ctx.app).post('/fuelbot/sales')
      .set({ 'X-Tenant-Id': 'powerfuel', 'X-Machine-Id': 'DEV00001' }).send({ order_id: 'o1' });
    assert.equal(sale.status, 401);
    assert.equal(await Sale.countDocuments(), 0, 'nothing stored: the app keeps it');
  });

  it('without its key, nothing about a machine leaks (disabled comes after the key check)', async () => {
    const { key } = await issue();
    await Machine.updateOne({ _id: 'DEV00001' }, { disabled: true });
    assert.equal((await kiosk()).status, 401);
    assert.equal((await kiosk('AAAA-BBBB-CCCC-DDDD-EEEE')).status, 401);
    assert.equal((await kiosk(key)).body.error, 'machine_disabled');
  });

  it('optional: a missing key passes, a wrong one does not; off: never checked', async () => {
    const { key } = await issue();
    mode('optional');
    assert.equal((await kiosk()).status, 200);
    assert.equal((await kiosk('AAAA-BBBB-CCCC-DDDD-EEEE')).status, 401);
    assert.equal((await kiosk(key)).status, 200);
    mode('off');
    assert.equal((await kiosk('AAAA-BBBB-CCCC-DDDD-EEEE')).status, 200);
  });

  it('revoking ends a key at once (idempotent); a new key works', async () => {
    const first = await issue();
    assert.equal((await kiosk(first.key)).status, 200);
    const revoke = () => as.owner.delete(`${KEYS}/${first.machine_key.id}`);
    assert.ok((await revoke()).body.machine_key.revoked_at);
    assert.equal((await revoke()).status, 200);
    assert.equal((await kiosk(first.key)).status, 401);
    const second = await issue();
    assert.equal((await kiosk(second.key)).status, 200);
    assert.equal((await as.owner.delete(`/api/v1/tenants/powerfuel/machines/${other}/keys/${second.machine_key.id}`)).status,
      404, 'a key through another machine\'s path');
    assert.equal(await AuditEntry.countDocuments({ action: 'key.revoke' }), 1);
  });

  it('records when a key was last used', async () => {
    const { key, machine_key: mk } = await issue();
    await kiosk(key);
    let used = null;
    for (let i = 0; i < 50 && !used; i += 1) {
      used = (await MachineKey.findById(mk.id)).last_used_at;
      if (!used) await new Promise((r) => setTimeout(r, 20));
    }
    assert.ok(used instanceof Date);
  });

  it('no key ever reaches the logs', async () => {
    const captured = [];
    const originals = {};
    for (const level of ['log', 'warn', 'error', 'info']) {
      originals[level] = console[level];
      console[level] = (...args) => { captured.push(args.map(String).join(' ')); };
    }
    let key;
    try {
      ({ key } = await issue());
      await kiosk(key);
      await kiosk(`${key}X`);
      await request(ctx.app).post('/fuelbot/telemetry').set({ 'X-Tenant-Id': 'powerfuel', 'X-Machine-Id': 'DEV00001' })
        .set('Authorization', `Bearer ${key}`).send({ event_id: 'e1', event_type: 'x', tenant_id: 'other' });
    } finally {
      Object.assign(console, originals);
    }
    const text = captured.join('\n');
    assert.ok(!text.includes(normaliseKey(key)) && !text.includes(key));
  });
});

describe('seed dev key', () => {
  let ctx;
  before(async () => { ctx = await startServer({ MACHINE_AUTH: 'required' }); });
  after(async () => { await ctx.stop(); });

  it('the seed issues DEV_KEY for DEV00001 once; the kiosk works with it under required', async () => {
    const env = { ...process.env, MONGO_URL: ctx.settings.mongoUrl };
    await run('node', ['scripts/seed.js'], { cwd: SERVER_DIR, env });
    await run('node', ['scripts/seed.js'], { cwd: SERVER_DIR, env });
    assert.equal(await MachineKey.countDocuments({ machine_id: 'DEV00001' }), 1);
    const res = await request(ctx.app).get('/fuelbot/config')
      .set({ 'X-Tenant-Id': 'powerfuel', 'X-Machine-Id': 'DEV00001', Authorization: `Bearer ${DEV_KEY}` });
    assert.equal(res.status, 200);
  });
});
