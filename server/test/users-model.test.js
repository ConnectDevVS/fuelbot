import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { startServer } from './helpers.js';
import { User } from '../src/models/index.js';
import { checkPassword, hashPassword, verifyPassword } from '../src/auth/passwords.js';

const run = promisify(execFile);
const SERVER_DIR = new URL('..', import.meta.url).pathname;

describe('passwords', () => {
  it('accepts 10 characters to 72 bytes', () => {
    checkPassword('a'.repeat(10));
    checkPassword('a'.repeat(72));
    for (const bad of ['short', 'a'.repeat(73), 'é'.repeat(37), undefined, 12345678901]) {
      assert.throws(() => checkPassword(bad), (e) => e.status === 400 && e.message === 'weak_password');
    }
  });

  it('hashes and verifies; a missing hash never verifies', async () => {
    const hash = await hashPassword('correct horse battery', 4);
    assert.ok(await verifyPassword('correct horse battery', hash));
    assert.ok(!(await verifyPassword('wrong horse battery', hash)));
    assert.ok(!(await verifyPassword('not-a-real-password', undefined)));
    assert.ok(!(await verifyPassword(undefined, hash)));
  });
});

describe('User model', () => {
  let ctx;
  before(async () => { ctx = await startServer(); });
  after(async () => { await ctx.stop(); });
  beforeEach(async () => { await ctx.reset(); });

  const base = { password_hash: 'x', name: 'N' };

  it('tenant roles need a tenant; platform_admin never has one', async () => {
    await assert.rejects(User.create({ ...base, email: 'a@x.io', role: 'operator' }), /tenant_id/);
    const admin = await User.create({ ...base, email: 'p@x.io', role: 'platform_admin', tenant_id: 'acme', machines: ['m1'] });
    assert.equal(admin.tenant_id, undefined);
    assert.deepEqual([...admin.machines], []);
  });

  it('a tenant_admin always has every machine', async () => {
    const u = await User.create({ ...base, email: 't@x.io', role: 'tenant_admin', tenant_id: 'acme', machines: ['m1'] });
    assert.deepEqual([...u.machines], []);
  });

  it('emails are lowercased and unique; unknown roles refused', async () => {
    await User.create({ ...base, email: ' Ops@X.io ', role: 'platform_admin' });
    assert.equal((await User.findOne()).email, 'ops@x.io');
    await assert.rejects(User.create({ ...base, email: 'ops@x.io', role: 'platform_admin' }), (e) => e.code === 11000);
    await assert.rejects(User.create({ ...base, email: 'r@x.io', role: 'superuser' }), /role/);
  });

  it('never returns the password hash unless asked', async () => {
    await User.create({ ...base, email: 'h@x.io', role: 'platform_admin' });
    assert.equal((await User.findOne({ email: 'h@x.io' }).lean()).password_hash, undefined);
    assert.equal((await User.findOne({ email: 'h@x.io' }).select('+password_hash').lean()).password_hash, 'x');
  });
});

describe('create-admin script', () => {
  let ctx;
  before(async () => { ctx = await startServer(); });
  after(async () => { await ctx.stop(); });
  beforeEach(async () => { await ctx.reset(); });

  const exec = (args, password) => run('node', ['scripts/create-admin.js', ...args], {
    cwd: SERVER_DIR,
    env: { ...process.env, MONGO_URL: ctx.settings.mongoUrl, BCRYPT_COST: '4', ...(password ? { ADMIN_PASSWORD: password } : {}) },
  });

  it('creates a platform_admin that can sign in with that password', async () => {
    const { stdout } = await exec(['--email=Ops@FuelBot.example', '--name=Ops'], 'a long enough secret');
    assert.match(stdout, /Created platform_admin ops@fuelbot.example/);
    assert.doesNotMatch(stdout, /a long enough secret/);
    const user = await User.findOne({ email: 'ops@fuelbot.example' }).select('+password_hash').lean();
    assert.equal(user.role, 'platform_admin');
    assert.equal(user.must_change_password, false);
    assert.ok(await verifyPassword('a long enough secret', user.password_hash));
  });

  it('refuses an existing email, a weak password, and a missing password without a terminal', async () => {
    await exec(['--email=ops@fuelbot.example'], 'a long enough secret');
    await assert.rejects(exec(['--email=ops@fuelbot.example'], 'another long secret'),
      (e) => e.code === 1 && /already exists/.test(e.stderr));
    await assert.rejects(exec(['--email=two@fuelbot.example'], 'short'),
      (e) => e.code === 1 && /Refused/.test(e.stderr));
    await assert.rejects(exec(['--email=three@fuelbot.example']),
      (e) => e.code === 2 && /ADMIN_PASSWORD/.test(e.stderr));
    assert.equal(await User.countDocuments(), 1);
  });
});
