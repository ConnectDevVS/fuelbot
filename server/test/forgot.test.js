// Forgot password (plan §4.16, SRV-57): POST /auth/forgot and /auth/reset.
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { CSRF, makeUser, signIn, startServer } from './helpers.js';
import { AuditEntry, Tenant, User } from '../src/models/index.js';
import { CODE_TTL_MS } from '../src/services/codes.js';

const NEW = 'a brand new secret';

describe('forgot password (/api/v1/auth/forgot, /reset)', () => {
  let ctx;
  let desk;   // a new address per test: the limiters (per IP + email) live as long as the file's app
  let n = 0;
  const forgot = async (email) => {
    const res = await request(ctx.app).post('/api/v1/auth/forgot').set(CSRF).send({ email });
    await ctx.idle();
    return res;
  };
  const reset = (body) => request(ctx.app).post('/api/v1/auth/reset').set(CSRF).send(body);
  const codeOf = (email) => ctx.mail.lastCodeFor(email);
  const wrong = (code) => (code === 'AAAAAA' ? 'BBBBBB' : 'AAAAAA');

  before(async () => { ctx = await startServer({ LOGIN_RATE_LIMIT: '100' }); });
  after(async () => { await ctx.stop(); });
  beforeEach(async () => {
    await ctx.reset();
    await Tenant.create([{ _id: 'powerfuel', name: 'PowerFuel Gym' }, { _id: 'shut', name: 'Shut', disabled: true }]);
    n += 1;
    desk = `desk${n}@powerfuel.example`;
    await makeUser({ email: desk, role: 'operator', tenant_id: 'powerfuel' });
    await makeUser({ email: 'gone@powerfuel.example', role: 'operator', tenant_id: 'powerfuel', disabled: true });
    await makeUser({ email: 'staff@shut.example', role: 'operator', tenant_id: 'shut' });
  });

  it('forgot mails a code to an active user', async () => {
    const res = await forgot(` ${desk.toUpperCase()} `);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
    const [mail] = ctx.mail.to(desk);
    assert.match(mail.text, /reset the password/);
    assert.match(codeOf(desk), /^[A-Z0-9]{6}$/);
    assert.equal((await AuditEntry.find({ action: 'auth.code_sent' }).lean()).length, 1);
  });

  it('forgot answers the same for unknown, disabled user and disabled tenant, and mails nothing', async () => {
    for (const email of ['nobody@powerfuel.example', 'gone@powerfuel.example', 'staff@shut.example', '']) {
      const res = await forgot(email);
      assert.equal(res.status, 200, email);
      assert.deepEqual(res.body, { ok: true }, email);
    }
    assert.equal(ctx.mail.sent.length, 0);
    assert.equal(await AuditEntry.countDocuments({ action: 'auth.code_sent' }), 0);
  });

  it('forgot resends the same code within 30 min, a new one after', async () => {
    await forgot(desk);
    const first = codeOf(desk);
    await forgot(desk);
    assert.equal(codeOf(desk), first);
    const past = Date.now() - CODE_TTL_MS - 60 * 1000;
    await User.updateOne({ email: desk },
      { $set: { 'email_code.issued_at': new Date(past), 'email_code.expires_at': new Date(past + CODE_TTL_MS) } });
    await forgot(desk);
    assert.notEqual(codeOf(desk), first);
  });

  it('forgot answers 200 when mail fails, and logs no address', async () => {
    ctx.mail.fail = true;
    const logged = [];
    const original = console.error;
    console.error = (...args) => logged.push(args.join(' '));
    try {
      assert.equal((await forgot(desk)).status, 200);
    } finally {
      console.error = original;
    }
    assert.equal(logged.length, 1);
    assert.ok(!logged[0].includes(desk), logged[0]);
  });

  it('reset with the right code sets the password and ends sessions', async () => {
    const session = await signIn(ctx.app, desk);
    await forgot(desk);
    const code = codeOf(desk);
    const res = await reset({ email: desk, code: code.toLowerCase(), new: NEW });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
    assert.equal((await session.get('/api/v1/auth/me')).status, 401);
    assert.ok(await signIn(ctx.app, desk, NEW));
    const again = await reset({ email: desk, code, new: 'yet another secret' });
    assert.equal(again.body.error, 'invalid_code', 'the code was cleared');
    assert.equal(await AuditEntry.countDocuments({ action: 'auth.password_reset' }), 1);
  });

  it('reset clears must_change_password', async () => {
    await makeUser({ email: 'new@powerfuel.example', role: 'viewer', tenant_id: 'powerfuel', must_change_password: true });
    await forgot('new@powerfuel.example');
    await reset({ email: 'new@powerfuel.example', code: codeOf('new@powerfuel.example'), new: NEW });
    const agent = await signIn(ctx.app, 'new@powerfuel.example', NEW);
    assert.equal((await agent.get('/api/v1/auth/me')).body.user.must_change_password, false);
  });

  it('reset with a wrong, expired or unknown-email code is invalid_code', async () => {
    await forgot(desk);
    const code = codeOf(desk);
    for (const body of [
      { email: desk, code: wrong(code), new: NEW },
      { email: 'nobody@powerfuel.example', code, new: NEW },
      { email: 'gone@powerfuel.example', code, new: NEW },
    ]) {
      const res = await reset(body);
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'invalid_code');
    }
    await User.updateOne({ email: desk }, { $set: { 'email_code.expires_at': new Date(Date.now() - 1000) } });
    assert.equal((await reset({ email: desk, code, new: NEW })).body.error, 'invalid_code');
  });

  it('five wrong codes void it', async () => {
    await forgot(desk);
    const code = codeOf(desk);
    for (let i = 0; i < 5; i += 1) await reset({ email: desk, code: wrong(code), new: NEW });
    assert.equal((await reset({ email: desk, code, new: NEW })).body.error, 'invalid_code');
    const failed = await AuditEntry.find({ action: 'auth.code_failed' }).sort({ at: 1 }).lean();
    assert.deepEqual(failed.map((e) => e.after.voided), [false, false, false, false, true, false]);   // the 6th: no code left
  });

  it('weak password and missing fields are checked before the code', async () => {
    await forgot(desk);
    const code = codeOf(desk);
    for (let i = 0; i < 6; i += 1) {
      assert.equal((await reset({ email: desk, code: wrong(code), new: 'short' })).body.error, 'weak_password');
    }
    const missing = await reset({ email: desk });
    assert.equal(missing.body.error, 'invalid_body');
    assert.deepEqual(missing.body.details.map((d) => d.field), ['code', 'new']);
    assert.equal((await reset({ email: desk, code, new: NEW })).status, 200);
  });

  it('reset doesn\'t sign in', async () => {
    await forgot(desk);
    const res = await reset({ email: desk, code: codeOf(desk), new: NEW });
    assert.equal(res.status, 200);
    assert.equal(res.headers['set-cookie'], undefined);
  });

  it('forgot and reset are rate-limited per IP + email', async () => {
    for (let i = 0; i < 5; i += 1) assert.equal((await forgot('limit@powerfuel.example')).status, 200);
    const limited = await forgot('limit@powerfuel.example');
    assert.equal(limited.status, 429);
    assert.equal(limited.body.error, 'too_many_attempts');
    assert.equal((await forgot('other@powerfuel.example')).status, 200, 'another email is its own bucket');
    const body = { email: 'limit2@powerfuel.example', code: 'AAAAAA', new: NEW };
    for (let i = 0; i < 10; i += 1) assert.equal((await reset(body)).status, 400);
    assert.equal((await reset(body)).status, 429);
  });

  it('works without a session but needs the dashboard header', async () => {
    assert.equal((await request(ctx.app).post('/api/v1/auth/forgot').send({ email: desk })).status, 403);
    assert.equal((await request(ctx.app).post('/api/v1/auth/reset').send({})).status, 403);
  });

  it('the audit log never holds a code', async () => {
    await forgot(desk);
    const code = codeOf(desk);
    await reset({ email: desk, code: wrong(code), new: NEW });
    await reset({ email: desk, code, new: NEW });
    const all = JSON.stringify(await AuditEntry.find().lean());
    assert.ok(!all.includes(code) && !all.includes(wrong(code)));
  });
});
