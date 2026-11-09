// Emailed codes on the user and first-sign-in routes (plan §4.16, SRV-56).
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, signIn, startServer } from './helpers.js';
import { AuditEntry, Tenant, User } from '../src/models/index.js';
import { CODE_TTL_MS } from '../src/services/codes.js';

const TEMP = 'a temporary secret';
const MINE = 'my very own secret';

describe('emailed codes: users and first sign-in', () => {
  let ctx;
  let owner;    // tenant_admin of powerfuel
  const codeOf = (email) => ctx.mail.lastCodeFor(email);
  const age = (email, ms = CODE_TTL_MS + 60 * 1000) => User.updateOne({ email },
    { $set: { 'email_code.issued_at': new Date(Date.now() - ms), 'email_code.expires_at': new Date(Date.now() - ms + CODE_TTL_MS) } });
  const createDesk = () => owner.post('/api/v1/users', { email: 'desk@powerfuel.example', role: 'operator', password: TEMP });
  const wrong = (code) => (code === 'AAAAAA' ? 'BBBBBB' : 'AAAAAA');

  before(async () => { ctx = await startServer({ LOGIN_RATE_LIMIT: '100' }); });
  after(async () => { await ctx.stop(); });
  beforeEach(async () => {
    await ctx.reset();
    await Tenant.create([{ _id: 'powerfuel', name: 'PowerFuel Gym' }, { _id: 'globex', name: 'Globex' }]);
    await makeUser({ email: 'ops@fuelbot.example', role: 'platform_admin' });
    await makeUser({ email: 'owner@powerfuel.example', role: 'tenant_admin', tenant_id: 'powerfuel' });
    await makeUser({ email: 'boss@globex.example', role: 'tenant_admin', tenant_id: 'globex' });
    owner = await signIn(ctx.app, 'owner@powerfuel.example');
  });

  it('creating a user mails a welcome code', async () => {
    const res = await createDesk();
    assert.equal(res.status, 201);
    assert.equal(res.body.code_mail, 'sent');
    const mails = ctx.mail.to('desk@powerfuel.example');
    assert.equal(mails.length, 1);
    assert.match(mails[0].text, /temporary password your admin/);
    assert.ok(!mails[0].text.includes(TEMP) && !mails[0].html.includes(TEMP), 'never the temporary password');
    assert.match(codeOf('desk@powerfuel.example'), /^[A-Z0-9]{6}$/);
    const [entry] = await AuditEntry.find({ action: 'user.create' }).lean();
    assert.equal(entry.after.code_mail, 'sent');
  });

  it('create still succeeds when mail fails', async () => {
    ctx.mail.fail = true;
    const res = await createDesk();
    assert.equal(res.status, 201);
    assert.equal(res.body.code_mail, 'failed');
    assert.ok(await User.exists({ email: 'desk@powerfuel.example' }));
  });

  it('admin reset mails a code and reuses a live one', async () => {
    const { body } = await createDesk();
    const first = codeOf('desk@powerfuel.example');
    const reset = await owner.post(`/api/v1/users/${body.user.id}/password`, { password: 'another temp secret' });
    assert.equal(reset.status, 200);
    assert.equal(reset.body.code_mail, 'sent');
    assert.equal(ctx.mail.to('desk@powerfuel.example').length, 2);
    assert.match(ctx.mail.to('desk@powerfuel.example')[1].text, /set a new temporary password/);
    assert.equal(codeOf('desk@powerfuel.example'), first);
  });

  it('admin resend sends the same code until it expires, then a new one', async () => {
    const { body } = await createDesk();
    const first = codeOf('desk@powerfuel.example');
    const again = await owner.post(`/api/v1/users/${body.user.id}/code`);
    assert.equal(again.status, 200);
    assert.equal(again.body.ok, true);
    assert.match(again.body.expires_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    assert.ok(!JSON.stringify(again.body).includes(first), 'the code is never in a response');
    assert.equal(codeOf('desk@powerfuel.example'), first);
    await age('desk@powerfuel.example');
    await owner.post(`/api/v1/users/${body.user.id}/code`);
    assert.notEqual(codeOf('desk@powerfuel.example'), first);
    assert.equal((await AuditEntry.find({ action: 'user.code_sent' }).lean()).length, 2);
  });

  it('admin resend: self 403, disabled 409, other tenant 404, mail failure 502', async () => {
    const { body } = await createDesk();
    const ownerId = String((await User.findOne({ email: 'owner@powerfuel.example' }))._id);
    assert.equal((await owner.post(`/api/v1/users/${ownerId}/code`)).body.error, 'forbidden_self');
    const boss = await signIn(ctx.app, 'boss@globex.example');
    assert.equal((await boss.post(`/api/v1/users/${body.user.id}/code`)).status, 404);
    ctx.mail.fail = true;
    const failed = await owner.post(`/api/v1/users/${body.user.id}/code`);
    assert.equal(failed.status, 502);
    assert.equal(failed.body.error, 'mail_failed');
    ctx.mail.fail = false;
    await owner.patch(`/api/v1/users/${body.user.id}`, { disabled: true });
    const disabled = await owner.post(`/api/v1/users/${body.user.id}/code`);
    assert.equal(disabled.status, 409);
    assert.equal(disabled.body.error, 'user_disabled');
  });

  it('forced change needs the code', async () => {
    await createDesk();
    const desk = await signIn(ctx.app, 'desk@powerfuel.example', TEMP);
    const other = await signIn(ctx.app, 'desk@powerfuel.example', TEMP);
    const code = codeOf('desk@powerfuel.example');
    for (const bad of [undefined, '', wrong(code)]) {
      const res = await desk.post('/api/v1/auth/password', { current: TEMP, new: MINE, code: bad });
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'invalid_code');
    }
    const ok = await desk.post('/api/v1/auth/password', { current: TEMP, new: MINE, code: code.toLowerCase() });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.user.must_change_password, false);
    assert.equal((await User.findOne({ email: 'desk@powerfuel.example' }).select('+email_code').lean()).email_code, null);
    assert.equal((await other.get('/api/v1/auth/me')).status, 401, 'other sessions end');
    assert.ok(await signIn(ctx.app, 'desk@powerfuel.example', MINE));
    const failures = await AuditEntry.find({ action: 'auth.code_failed' }).lean();
    assert.equal(failures.length, 3);
    assert.ok(!JSON.stringify(failures).includes(code));
  });

  it('a wrong current password doesn\'t use a code attempt', async () => {
    await createDesk();
    const desk = await signIn(ctx.app, 'desk@powerfuel.example', TEMP);
    const code = codeOf('desk@powerfuel.example');
    for (let i = 0; i < 6; i += 1) {
      const res = await desk.post('/api/v1/auth/password', { current: 'not my password', new: MINE, code: wrong(code) });
      assert.equal(res.body.error, 'wrong_password');
    }
    assert.equal((await desk.post('/api/v1/auth/password', { current: TEMP, new: MINE, code })).status, 200);
  });

  it('five wrong codes void it; a new one is mailed on request', async () => {
    await createDesk();
    const desk = await signIn(ctx.app, 'desk@powerfuel.example', TEMP);
    const code = codeOf('desk@powerfuel.example');
    for (let i = 0; i < 5; i += 1) await desk.post('/api/v1/auth/password', { current: TEMP, new: MINE, code: wrong(code) });
    const [last] = await AuditEntry.find({ action: 'auth.code_failed' }).sort({ at: -1 }).limit(1).lean();
    assert.equal(last.after.voided, true);
    assert.equal((await desk.post('/api/v1/auth/password', { current: TEMP, new: MINE, code })).body.error, 'invalid_code');
    assert.equal((await desk.post('/api/v1/auth/code')).status, 200);
    const fresh = codeOf('desk@powerfuel.example');
    assert.notEqual(fresh, code);
    assert.equal((await desk.post('/api/v1/auth/password', { current: TEMP, new: MINE, code: fresh })).status, 200);
  });

  it('a voluntary change ignores the code', async () => {
    const res = await owner.post('/api/v1/auth/password', { current: 'a long enough secret', new: MINE });
    assert.equal(res.status, 200);
    assert.equal(ctx.mail.sent.length, 0);
  });

  it('POST /auth/code works while forced, 409 after, 429 after 5', async () => {
    await createDesk();
    const desk = await signIn(ctx.app, 'desk@powerfuel.example', TEMP);
    const welcome = codeOf('desk@powerfuel.example');
    const res = await desk.post('/api/v1/auth/code');
    assert.equal(res.status, 200);
    assert.ok(res.body.expires_at);
    assert.equal(codeOf('desk@powerfuel.example'), welcome, 'the live code again');
    assert.match(ctx.mail.to('desk@powerfuel.example').at(-1).text, /the code you asked for/);
    assert.equal((await AuditEntry.find({ action: 'auth.code_sent' }).lean()).length, 1);
    for (let i = 0; i < 4; i += 1) assert.equal((await desk.post('/api/v1/auth/code')).status, 200);
    assert.equal((await desk.post('/api/v1/auth/code')).status, 429);

    assert.equal((await owner.post('/api/v1/auth/code')).body.error, 'not_needed');
    ctx.mail.fail = true;
    const other = await owner.post('/api/v1/users', { email: 'till@powerfuel.example', role: 'viewer', password: TEMP });
    assert.equal(other.body.code_mail, 'failed');
    const till = await signIn(ctx.app, 'till@powerfuel.example', TEMP);
    assert.equal((await till.post('/api/v1/auth/code')).status, 502);
  });
});
