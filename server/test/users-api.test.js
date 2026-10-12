import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, signIn, startServer } from './helpers.js';
import { Machine, Tenant, User } from '../src/models/index.js';

const NEW_PASSWORD = 'a temporary secret';

describe('/api/v1/users', () => {
  let ctx;
  let ops;      // platform_admin
  let owner;    // tenant_admin of powerfuel
  const id = async (email) => String((await User.findOne({ email }))._id);

  before(async () => { ctx = await startServer(); });
  after(async () => { await ctx.stop(); });
  beforeEach(async () => {
    await ctx.reset();
    await Tenant.create([{ _id: 'powerfuel', name: 'PowerFuel Gym' }, { _id: 'globex', name: 'Globex' }]);
    await Machine.collection.insertMany([
      { _id: 'machine-042', tenant_id: 'powerfuel' }, { _id: 'machine-043', tenant_id: 'powerfuel' },
      { _id: 'globex-1', tenant_id: 'globex' },
    ]);
    await makeUser({ email: 'ops@fuelbot.example', role: 'platform_admin' });
    await makeUser({ email: 'owner@powerfuel.example', role: 'tenant_admin', tenant_id: 'powerfuel' });
    await makeUser({ email: 'boss@globex.example', role: 'tenant_admin', tenant_id: 'globex' });
    ops = await signIn(ctx.app, 'ops@fuelbot.example');
    owner = await signIn(ctx.app, 'owner@powerfuel.example');
  });

  it('platform sees everyone; a tenant_admin only their tenant; operators and viewers nothing', async () => {
    const all = await ops.get('/api/v1/users');
    assert.equal(all.status, 200);
    assert.equal(all.body.items.length, 3);
    assert.ok(all.body.items.every((u) => !('password_hash' in u)));
    const mine = await owner.get('/api/v1/users');
    assert.deepEqual(mine.body.items.map((u) => u.email), ['owner@powerfuel.example']);
    const byTenant = await ops.get('/api/v1/users?tenant=globex');
    assert.deepEqual(byTenant.body.items.map((u) => u.email), ['boss@globex.example']);

    await makeUser({ email: 'op@powerfuel.example', role: 'operator', tenant_id: 'powerfuel' });
    const op = await signIn(ctx.app, 'op@powerfuel.example');
    assert.equal((await op.get('/api/v1/users')).status, 403);
  });

  it('a tenant_admin creates users of their own tenant, incl. another tenant_admin', async () => {
    let res = await owner.post('/api/v1/users', { email: 'Desk@PowerFuel.example', name: 'Desk', role: 'operator',
      machines: ['machine-042'], password: NEW_PASSWORD });
    assert.equal(res.status, 201);
    assert.equal(res.body.user.email, 'desk@powerfuel.example');
    assert.equal(res.body.user.tenant_id, 'powerfuel');
    assert.deepEqual(res.body.user.machines, ['machine-042']);
    assert.equal(res.body.user.must_change_password, true);

    res = await owner.post('/api/v1/users', { email: 'co@powerfuel.example', role: 'tenant_admin', password: NEW_PASSWORD });
    assert.equal(res.status, 201);

    const desk = await signIn(ctx.app, 'desk@powerfuel.example', NEW_PASSWORD);
    assert.equal((await desk.get('/api/v1/users')).body.error, 'password_change_required');
  });

  it('a tenant_admin cannot create platform users or users elsewhere', async () => {
    const cases = [
      [{ email: 'x@x.io', role: 'platform_admin', password: NEW_PASSWORD }, 403, 'forbidden'],
      [{ email: 'x@x.io', role: 'operator', tenant_id: 'globex', password: NEW_PASSWORD }, 403, 'forbidden'],
      [{ email: 'x@x.io', role: 'operator', machines: ['globex-1'], password: NEW_PASSWORD }, 400, 'unknown_machine'],
      [{ email: 'x@x.io', role: 'tenant_admin', machines: ['machine-042'], password: NEW_PASSWORD }, 400, 'machines_not_allowed'],
      [{ email: 'x@x.io', role: 'owner', password: NEW_PASSWORD }, 400, 'invalid_role'],
      [{ email: 'not-an-email', role: 'viewer', password: NEW_PASSWORD }, 400, 'invalid_email'],
      [{ email: 'x@x.io', role: 'viewer', password: 'short' }, 400, 'weak_password'],
      [{ email: 'owner@powerfuel.example', role: 'viewer', password: NEW_PASSWORD }, 409, 'email_taken'],
    ];
    for (const [body, status, error] of cases) {
      const res = await owner.post('/api/v1/users', body);
      assert.equal(res.status, status, JSON.stringify(body));
      assert.equal(res.body.error, error, JSON.stringify(body));
    }
    assert.equal((await ops.post('/api/v1/users', { email: 'y@y.io', role: 'viewer', tenant_id: 'nope', password: NEW_PASSWORD }))
      .body.error, 'unknown_tenant');
    assert.equal(await User.countDocuments(), 3);
  });

  it('another tenant\'s user is not found (404), whatever the action', async () => {
    const boss = await id('boss@globex.example');
    assert.equal((await owner.patch(`/api/v1/users/${boss}`, { name: 'x' })).status, 404);
    assert.equal((await owner.post(`/api/v1/users/${boss}/password`, { password: NEW_PASSWORD })).status, 404);
    assert.equal((await owner.patch('/api/v1/users/not-an-id', { name: 'x' })).status, 404);
  });

  it('nobody changes their own role or disables themselves', async () => {
    const me = await id('owner@powerfuel.example');
    assert.equal((await owner.patch(`/api/v1/users/${me}`, { role: 'viewer' })).body.error, 'forbidden_self');
    assert.equal((await owner.patch(`/api/v1/users/${me}`, { disabled: true })).body.error, 'forbidden_self');
    assert.equal((await owner.post(`/api/v1/users/${me}/password`, { password: NEW_PASSWORD })).body.error, 'forbidden_self');
    assert.equal((await owner.patch(`/api/v1/users/${me}`, { name: 'Owner' })).status, 200, 'own name is fine');
  });

  it('a tenant keeps at least one active tenant_admin', async () => {
    const ownerId = await id('owner@powerfuel.example');
    let res = await ops.patch(`/api/v1/users/${ownerId}`, { disabled: true });
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'last_tenant_admin');
    assert.equal((await ops.patch(`/api/v1/users/${ownerId}`, { role: 'operator' })).body.error, 'last_tenant_admin');

    await owner.post('/api/v1/users', { email: 'co@powerfuel.example', role: 'tenant_admin', password: NEW_PASSWORD });
    res = await ops.patch(`/api/v1/users/${ownerId}`, { disabled: true });
    assert.equal(res.status, 200, 'fine once there is another');
  });

  it('disabling ends sessions; re-enabling restores access; nothing is deleted', async () => {
    await owner.post('/api/v1/users', { email: 'co@powerfuel.example', role: 'tenant_admin', password: NEW_PASSWORD });
    const ownerId = await id('owner@powerfuel.example');
    await ops.patch(`/api/v1/users/${ownerId}`, { disabled: true });
    assert.equal((await owner.get('/api/v1/auth/me')).status, 401);
    await ops.patch(`/api/v1/users/${ownerId}`, { disabled: false });
    assert.ok(await signIn(ctx.app, 'owner@powerfuel.example'));
    assert.equal((await ops.delete(`/api/v1/users/${ownerId}`)).status, 404, 'no delete route');
    assert.equal(await User.countDocuments({ email: 'owner@powerfuel.example' }), 1);
  });

  it('role and machine changes follow the rules; tenant_id never changes', async () => {
    const res = await owner.post('/api/v1/users', { email: 'desk@powerfuel.example', role: 'operator',
      machines: ['machine-042'], password: NEW_PASSWORD });
    const desk = res.body.user.id;
    let patch = await owner.patch(`/api/v1/users/${desk}`, { role: 'viewer' });
    assert.deepEqual(patch.body.user.machines, ['machine-042'], 'machines kept operator → viewer');
    patch = await owner.patch(`/api/v1/users/${desk}`, { role: 'tenant_admin' });
    assert.deepEqual(patch.body.user.machines, [], 'a tenant_admin has all machines');
    assert.equal((await owner.patch(`/api/v1/users/${desk}`, { tenant_id: 'globex' })).body.error, 'tenant_immutable');
    assert.equal((await ops.patch(`/api/v1/users/${desk}`, { role: 'platform_admin' })).body.error, 'role_scope_change');
    assert.equal((await owner.patch(`/api/v1/users/${desk}`, { email: 'e@x.io' })).body.error, 'unknown_field');
  });

  it('an admin-set password is temporary and ends the user\'s sessions', async () => {
    const res = await owner.post('/api/v1/users', { email: 'desk@powerfuel.example', role: 'viewer', password: NEW_PASSWORD });
    const deskAgent = await signIn(ctx.app, 'desk@powerfuel.example', NEW_PASSWORD);
    const reset = await owner.post(`/api/v1/users/${res.body.user.id}/password`, { password: 'another temp secret' });
    assert.equal(reset.status, 200);
    assert.equal(reset.body.user.must_change_password, true);
    assert.equal((await deskAgent.get('/api/v1/auth/me')).status, 401);
    assert.ok(await signIn(ctx.app, 'desk@powerfuel.example', 'another temp secret'));
  });

  it('pages newest first with an opaque cursor', async () => {
    for (let i = 0; i < 4; i += 1) {
      await ops.post('/api/v1/users', { email: `u${i}@x.io`, role: 'viewer', tenant_id: 'globex', password: NEW_PASSWORD });
    }
    const seen = [];
    let cursor = null;
    do {
      const res = await ops.get(`/api/v1/users?limit=3${cursor ? `&cursor=${cursor}` : ''}`);
      assert.ok(res.body.items.length <= 3);
      seen.push(...res.body.items.map((u) => u.email));
      cursor = res.body.next_cursor;
    } while (cursor);
    assert.equal(seen.length, 7);
    assert.equal(seen[0], 'u3@x.io');
    assert.equal(new Set(seen).size, 7);
    assert.equal((await ops.get('/api/v1/users?cursor=bogus')).body.error, 'invalid_cursor');
  });
});
