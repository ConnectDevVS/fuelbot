import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { CSRF, PASSWORD, makeUser, signIn, startServer } from './helpers.js';
import { AuditEntry, Machine, Tenant, User } from '../src/models/index.js';

const TEMP = 'temporary pass 123';
const CHANGED = 'my very own secret';

describe('audit log', () => {
  let ctx;
  let ops;
  let owner;

  before(async () => { ctx = await startServer(); });
  after(async () => { await ctx.stop(); });
  beforeEach(async () => {
    await ctx.reset();
    await Tenant.create({ _id: 'powerfuel', name: 'PowerFuel Gym' });
    await Machine.collection.insertOne({ _id: 'machine-042', tenant_id: 'powerfuel' });
    await makeUser({ email: 'ops@fuelbot.example', role: 'platform_admin' });
    await makeUser({ email: 'owner@powerfuel.example', role: 'tenant_admin', tenant_id: 'powerfuel' });
    ops = await signIn(ctx.app, 'ops@fuelbot.example');
    owner = await signIn(ctx.app, 'owner@powerfuel.example');
  });

  const entries = async (action) => AuditEntry.find(action ? { action } : {}).sort({ at: 1 }).lean();

  it('records sign-ins, including failures (email as typed, no user)', async () => {
    await request(ctx.app).post('/api/v1/auth/login').set(CSRF).send({ email: 'Owner@PowerFuel.example', password: 'wrong password!' });
    const failed = await entries('auth.login_failed');
    assert.equal(failed.length, 1);
    assert.equal(failed[0].user_email, 'owner@powerfuel.example');
    assert.equal(failed[0].user_id, null);
    const ok = await entries('auth.login');
    assert.deepEqual(ok.map((e) => e.user_email), ['ops@fuelbot.example', 'owner@powerfuel.example']);
    assert.equal(ok[1].tenant_id, 'powerfuel');
  });

  it('records user create, update (changed fields only) and password reset', async () => {
    const created = await owner.post('/api/v1/users', { email: 'desk@powerfuel.example', role: 'operator',
      machines: ['machine-042'], password: TEMP });
    const deskId = created.body.user.id;
    await owner.patch(`/api/v1/users/${deskId}`, { role: 'viewer', name: 'N', machines: ['machine-042'] });   // machines unchanged
    await owner.post(`/api/v1/users/${deskId}/password`, { password: 'another temp pass' });

    const [create] = await entries('user.create');
    assert.equal(create.user_email, 'owner@powerfuel.example');
    assert.equal(create.tenant_id, 'powerfuel');
    assert.equal(create.target, `user:${deskId}`);
    assert.deepEqual(create.after, { email: 'desk@powerfuel.example', name: '', role: 'operator', machines: ['machine-042'] });

    const [update] = await entries('user.update');
    assert.deepEqual(update.before, { name: '', role: 'operator' });
    assert.deepEqual(update.after, { name: 'N', role: 'viewer' });
    assert.equal((await entries('user.password_reset')).length, 1);
  });

  it('GET /audit is platform-only and filters', async () => {
    await owner.post('/api/v1/users', { email: 'desk@powerfuel.example', role: 'viewer', password: TEMP });
    assert.equal((await owner.get('/api/v1/audit')).status, 403);
    const all = await ops.get('/api/v1/audit');
    assert.equal(all.status, 200);
    assert.equal(all.body.items[0].action, 'user.create', 'newest first');
    const creates = await ops.get('/api/v1/audit?action=user.create&tenant=powerfuel');
    assert.equal(creates.body.items.length, 1);
    const ownerId = String((await User.findOne({ email: 'owner@powerfuel.example' }))._id);
    const byUser = await ops.get(`/api/v1/audit?user=${ownerId}`);
    assert.ok(byUser.body.items.every((e) => e.user_id === ownerId));
    const future = await ops.get('/api/v1/audit?from=2999-01-01T00:00:00Z');
    assert.equal(future.body.items.length, 0);
    assert.equal((await ops.get('/api/v1/audit?from=yesterday')).body.error, 'invalid_from');
  });

  it('no password ever reaches the logs or the audit log (plan §4.11)', async () => {
    const captured = [];
    const originals = {};
    for (const level of ['log', 'warn', 'error', 'info']) {
      originals[level] = console[level];
      console[level] = (...args) => { captured.push(args.map(String).join(' ')); };
    }
    try {
      const res = await owner.post('/api/v1/users', { email: 'desk@powerfuel.example', role: 'viewer', password: TEMP });
      const desk = await signIn(ctx.app, 'desk@powerfuel.example', TEMP);
      await desk.post('/api/v1/auth/password', { current: TEMP, new: CHANGED });
      await owner.post(`/api/v1/users/${res.body.user.id}/password`, { password: 'reset pass 4567' });
      await request(ctx.app).post('/api/v1/auth/login').set(CSRF).send({ email: 'desk@powerfuel.example', password: 'guess guess guess' });
    } finally {
      Object.assign(console, originals);
    }
    const haystack = captured.join('\n') + JSON.stringify(await AuditEntry.find().lean());
    for (const secret of [PASSWORD, TEMP, CHANGED, 'reset pass 4567', 'guess guess guess', '$2a$', '$2b$']) {
      assert.ok(!haystack.includes(secret), `leaked: ${secret}`);
    }
  });
});

// Contract test 5 (plan §7): every role against every admin route. Rows are added as routes land.
describe('RBAC table', () => {
  let ctx;
  const agents = {};
  before(async () => {
    ctx = await startServer();
    await Tenant.create({ _id: 'powerfuel', name: 'PowerFuel Gym' });
    const users = {
      platform_admin: { email: 'p@x.io', role: 'platform_admin' },
      tenant_admin: { email: 't@x.io', role: 'tenant_admin', tenant_id: 'powerfuel' },
      operator: { email: 'o@x.io', role: 'operator', tenant_id: 'powerfuel' },
      viewer: { email: 'v@x.io', role: 'viewer', tenant_id: 'powerfuel' },
    };
    for (const [role, fields] of Object.entries(users)) {
      await makeUser(fields);
      agents[role] = await signIn(ctx.app, fields.email);
    }
  });
  after(async () => { await ctx.stop(); });

  const TABLE = [
    //  method, path,                 platform, tenant_admin, operator, viewer
    ['get', '/api/v1/auth/me', 200, 200, 200, 200],
    ['get', '/api/v1/users', 200, 200, 403, 403],
    ['get', '/api/v1/audit', 200, 403, 403, 403],
  ];

  for (const [method, path, ...expected] of TABLE) {
    it(`${method.toUpperCase()} ${path}`, async () => {
      const roles = ['platform_admin', 'tenant_admin', 'operator', 'viewer'];
      for (const [i, role] of roles.entries()) {
        const res = await agents[role][method](path);
        assert.equal(res.status, expected[i], `${role}: ${JSON.stringify(res.body)}`);
      }
    });
  }
});
