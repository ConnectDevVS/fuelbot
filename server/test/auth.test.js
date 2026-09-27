import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { CSRF, PASSWORD, makeUser, startServer } from './helpers.js';
import { Tenant, User } from '../src/models/index.js';

function cookieOf(res) {
  return (res.headers['set-cookie'] ?? []).find((c) => c.startsWith('fb_session='));
}

describe('sessions (/api/v1/auth)', () => {
  let ctx;
  const login = (agent, email, password = PASSWORD) =>
    agent.post('/api/v1/auth/login').set(CSRF).send({ email, password });

  before(async () => { ctx = await startServer({ LOGIN_RATE_LIMIT: '3' }); });
  after(async () => { await ctx.stop(); });
  beforeEach(async () => {
    await ctx.reset();
    await Tenant.create({ _id: 'powerfuel', name: 'PowerFuel Gym' });
    await makeUser({ email: 'ops@fuelbot.example', role: 'platform_admin' });
    await makeUser({ email: 'owner@powerfuel.example', role: 'tenant_admin', tenant_id: 'powerfuel' });
  });

  it('signs in with a 48 h httpOnly SameSite=Strict cookie; /me never shows the hash', async () => {
    const agent = request.agent(ctx.app);
    const res = await login(agent, 'OPS@fuelbot.example');
    assert.equal(res.status, 200);
    const cookie = cookieOf(res);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    assert.match(cookie, /Max-Age=172800/);
    const token = decodeURIComponent(cookie.split(';')[0].slice('fb_session='.length));
    const claims = jwt.decode(token);
    assert.equal(claims.exp - claims.iat, 48 * 3600);
    const me = await agent.get('/api/v1/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, 'ops@fuelbot.example');
    assert.equal(me.body.user.role, 'platform_admin');
    assert.ok(!('password_hash' in me.body.user) && !('token_version' in me.body.user));
    assert.ok((await User.findOne({ email: 'ops@fuelbot.example' })).last_login_at instanceof Date);
    assert.equal(me.headers['x-content-type-options'], 'nosniff');   // helmet
  });

  it('every sign-in failure looks the same (401 invalid_credentials)', async () => {
    await makeUser({ email: 'gone@powerfuel.example', role: 'viewer', tenant_id: 'powerfuel', disabled: true });
    const bodies = [];
    for (const [email, password] of [['ops@fuelbot.example', 'wrong password!'], ['nobody@x.io', PASSWORD],
      ['gone@powerfuel.example', PASSWORD], ['', ''], [undefined, undefined]]) {
      const res = await request(ctx.app).post('/api/v1/auth/login').set(CSRF).send({ email, password });
      assert.equal(res.status, 401, String(email));
      assert.equal(cookieOf(res), undefined);
      bodies.push(JSON.stringify(res.body));
    }
    assert.equal(new Set(bodies).size, 1);
    assert.equal(bodies[0], '{"error":"invalid_credentials"}');
  });

  it('writes without the dashboard header are refused (CSRF)', async () => {
    const res = await request(ctx.app).post('/api/v1/auth/login').send({ email: 'ops@fuelbot.example', password: PASSWORD });
    assert.equal(res.status, 403);
    assert.equal(res.body.error, 'csrf_header_required');
  });

  it('rate-limits failed sign-ins per IP + email; successes do not count', async () => {
    // Its own user: the limiter lives in the app, which every test here shares.
    await makeUser({ email: 'limited@powerfuel.example', role: 'viewer', tenant_id: 'powerfuel' });
    for (let i = 0; i < 3; i += 1) {
      assert.equal((await login(request(ctx.app), 'limited@powerfuel.example', 'wrong password!')).status, 401);
    }
    const blocked = await login(request(ctx.app), 'limited@powerfuel.example');
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error, 'too_many_attempts');
    for (let i = 0; i < 5; i += 1) {   // another email is unaffected, and successes never block
      assert.equal((await login(request(ctx.app), 'ops@fuelbot.example')).status, 200);
    }
  });

  it('401 not_signed_in without a cookie, with a forged or expired one', async () => {
    assert.equal((await request(ctx.app).get('/api/v1/auth/me')).body.error, 'not_signed_in');
    const user = await User.findOne({ email: 'ops@fuelbot.example' });
    const forged = jwt.sign({ sub: String(user._id), tv: 0 }, 'not-the-secret');
    const expired = jwt.sign({ sub: String(user._id), tv: 0, exp: Math.floor(Date.now() / 1000) - 10 }, 'test-secret');
    const none = jwt.sign({ sub: String(user._id), tv: 0 }, '', { algorithm: 'none' });
    for (const token of [forged, expired, none, 'garbage']) {
      const res = await request(ctx.app).get('/api/v1/auth/me').set('Cookie', `fb_session=${token}`);
      assert.equal(res.status, 401);
      assert.equal(res.body.error, 'not_signed_in');
    }
  });

  it('disabling a user or bumping token_version ends their sessions at once', async () => {
    const agent = request.agent(ctx.app);
    await login(agent, 'owner@powerfuel.example');
    assert.equal((await agent.get('/api/v1/auth/me')).status, 200);
    await User.updateOne({ email: 'owner@powerfuel.example' }, { $inc: { token_version: 1 } });
    assert.equal((await agent.get('/api/v1/auth/me')).status, 401);
    await login(agent, 'owner@powerfuel.example');
    await User.updateOne({ email: 'owner@powerfuel.example' }, { disabled: true });
    assert.equal((await agent.get('/api/v1/auth/me')).status, 401);
  });

  it('a disabled tenant locks its users out (403 tenant_disabled)', async () => {
    const agent = request.agent(ctx.app);
    await login(agent, 'owner@powerfuel.example');
    await Tenant.updateOne({ _id: 'powerfuel' }, { disabled: true });
    assert.equal((await agent.get('/api/v1/auth/me')).body.error, 'tenant_disabled');
    assert.equal((await login(request(ctx.app), 'owner@powerfuel.example')).status, 403);
    assert.equal((await login(request(ctx.app), 'ops@fuelbot.example')).status, 200);   // platform unaffected
  });

  it('a temporary password allows only /me, /password and /logout until changed', async () => {
    await makeUser({ email: 'new@powerfuel.example', role: 'operator', tenant_id: 'powerfuel', must_change_password: true });
    const agent = request.agent(ctx.app);
    const other = request.agent(ctx.app);
    await login(agent, 'new@powerfuel.example');
    await login(other, 'new@powerfuel.example');
    assert.equal((await agent.get('/api/v1/auth/me')).body.user.must_change_password, true);
    const gated = await agent.get('/api/v1/users');
    assert.equal(gated.status, 403);
    assert.equal(gated.body.error, 'password_change_required');

    const change = (body) => agent.post('/api/v1/auth/password').set(CSRF).send(body);
    assert.equal((await change({ current: 'wrong password!', new: 'a brand new secret' })).body.error, 'wrong_password');
    assert.equal((await change({ current: PASSWORD, new: PASSWORD })).body.error, 'same_password');
    assert.equal((await change({ current: PASSWORD, new: 'short' })).body.error, 'weak_password');
    const ok = await change({ current: PASSWORD, new: 'a brand new secret' });
    assert.equal(ok.status, 200);
    assert.ok(cookieOf(ok), 'a fresh cookie for this session');
    assert.equal(ok.body.user.must_change_password, false);

    assert.equal((await agent.get('/api/v1/auth/me')).status, 200, 'this session continues');
    assert.equal((await other.get('/api/v1/auth/me')).status, 401, 'other sessions end');
    assert.notEqual((await agent.get('/api/v1/users')).body.error, 'password_change_required', 'gate lifted');
    assert.equal((await login(request(ctx.app), 'new@powerfuel.example', 'a brand new secret')).status, 200);
  });

  it('sign-out ends that session on the server: a copied cookie stops working, others continue', async () => {
    const res = await login(request(ctx.app), 'ops@fuelbot.example');
    const copied = cookieOf(res).split(';')[0];
    const other = request.agent(ctx.app);
    await login(other, 'ops@fuelbot.example');
    const out = await request(ctx.app).post('/api/v1/auth/logout').set(CSRF).set('Cookie', copied);
    assert.equal(out.status, 200);
    const again = await request(ctx.app).get('/api/v1/auth/me').set('Cookie', copied);
    assert.equal(again.status, 401);
    assert.equal(again.body.error, 'not_signed_in');
    assert.equal((await other.get('/api/v1/auth/me')).status, 200);
    const { RevokedSession } = await import('../src/models/index.js');
    const [revoked] = await RevokedSession.find().lean();
    assert.ok(revoked.expires_at > new Date(), 'kept until the session would have expired');
    const noJti = jwt.sign({ sub: 'x', tv: 0 }, 'test-secret');
    assert.equal((await request(ctx.app).get('/api/v1/auth/me').set('Cookie', `fb_session=${noJti}`)).status, 401);
  });

  it('sign-out clears the cookie', async () => {
    const agent = request.agent(ctx.app);
    await login(agent, 'ops@fuelbot.example');
    const res = await agent.post('/api/v1/auth/logout').set(CSRF);
    assert.equal(res.status, 200);
    assert.match(cookieOf(res), /fb_session=;/);
    assert.equal((await agent.get('/api/v1/auth/me')).status, 401);
  });
});
