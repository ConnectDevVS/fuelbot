import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, signIn, startServer } from './helpers.js';
import { AuditEntry, Complaint, Tenant } from '../src/models/index.js';

const RAISE = { title: 'Screen frozen', description: 'Bay 02 froze after payment.' };

describe('/api/v1 complaints', () => {
  let ctx;
  const as = {};
  const users = {
    staff: { email: 'ops@fuelbot.example', name: 'Ops', role: 'platform_admin' },
    owner: { email: 'owner@powerfuel.example', name: 'Owner', role: 'tenant_admin', tenant_id: 'powerfuel' },
    desk: { email: 'desk@powerfuel.example', name: 'Desk', role: 'operator', tenant_id: 'powerfuel', machines: ['PF1'] },
    ops: { email: 'op@powerfuel.example', name: '', role: 'operator', tenant_id: 'powerfuel' },
    look: { email: 'look@powerfuel.example', name: 'Look', role: 'viewer', tenant_id: 'powerfuel' },
    boss: { email: 'boss@globex.example', name: 'Boss', role: 'tenant_admin', tenant_id: 'globex' },
  };
  const ids = {};
  const raise = (who, body = RAISE, tid = users[who].tenant_id) => as[who].post(`/api/v1/tenants/${tid}/complaints`, body);
  const list = (who, query = '', tid = users[who].tenant_id) => as[who].get(`/api/v1/tenants/${tid}/complaints${query}`);

  before(async () => {
    ctx = await startServer();
    await Tenant.create([{ _id: 'powerfuel', name: 'PowerFuel Gym' }, { _id: 'globex', name: 'Globex Fitness' }]);
    for (const [key, fields] of Object.entries(users)) {
      ids[key] = (await makeUser(fields))._id;
      as[key] = await signIn(ctx.app, fields.email);
    }
  });
  after(async () => { await ctx.stop(); });
  beforeEach(async () => {
    await Complaint.deleteMany({});
    await AuditEntry.deleteMany({});
    await Tenant.updateMany({}, { complaint_seq: 0 });
  });

  it('a tenant user raises a complaint', async () => {
    for (const [i, who] of ['owner', 'desk', 'look'].entries()) {
      const res = await raise(who);
      assert.equal(res.status, 201, JSON.stringify(res.body));
      const c = res.body.complaint;
      assert.equal(c.number, i + 1);
      assert.equal(c.status, 'open');
      assert.equal(c.title, RAISE.title);
      assert.equal(c.description, RAISE.description);
      assert.deepEqual(c.events, []);
      assert.equal(c.comment_count, 0);
      assert.equal(c.created_by.name, users[who].name);
      assert.ok(Math.abs(Date.parse(c.created_at) - Date.parse(c.last_activity_at)) < 1000);
    }
    const audits = await AuditEntry.find({ action: 'complaint.create' }).sort({ _id: 1 }).lean();
    assert.deepEqual(audits.map((a) => [a.user_email, a.tenant_id, a.target, a.after.title]), [
      ['owner@powerfuel.example', 'powerfuel', 'complaint:1', RAISE.title],
      ['desk@powerfuel.example', 'powerfuel', 'complaint:2', RAISE.title],
      ['look@powerfuel.example', 'powerfuel', 'complaint:3', RAISE.title],
    ]);
  });

  it('numbers are per tenant and never repeat under concurrency', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => raise('owner')));
    assert.ok(results.every((r) => r.status === 201));
    assert.deepEqual(results.map((r) => r.body.complaint.number).sort((a, b) => a - b),
      Array.from({ length: 20 }, (_, i) => i + 1));
    assert.equal((await raise('boss')).body.complaint.number, 1);
  });

  it('platform_admin can\'t raise', async () => {
    const res = await raise('staff', RAISE, 'powerfuel');
    assert.equal(res.status, 403);
    assert.equal(res.body.error, 'forbidden');
    assert.equal(await Complaint.countDocuments(), 0);
  });

  it('validation', async () => {
    const bad = [
      [{ title: 'ab', description: 'x' }, 'title'],
      [{ title: 'a'.repeat(121), description: 'x' }, 'title'],
      [{ title: '  ab  ', description: 'x' }, 'title'],
      [{ title: 'Fine', description: '' }, 'description'],
      [{ title: 'Fine', description: '   ' }, 'description'],
      [{ title: 'Fine', description: 'x'.repeat(4001) }, 'description'],
      [{ title: 'Fine', description: 'x', machine_id: 'PF1' }, 'machine_id'],
      [{ description: 'x' }, 'title'],
      [{ title: 42, description: 'x' }, 'title'],
    ];
    for (const [body, field] of bad) {
      const res = await raise('owner', body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(res.body.error, 'invalid_body');
      assert.ok(res.body.details.some((d) => d.field === field), `${field}: ${JSON.stringify(res.body.details)}`);
    }
    const trimmed = await raise('owner', { title: `  ${'a'.repeat(120)}  `, description: '  Line 1\nLine 2  ' });
    assert.equal(trimmed.status, 201);
    assert.equal(trimmed.body.complaint.title, 'a'.repeat(120));
    assert.equal(trimmed.body.complaint.description, 'Line 1\nLine 2');
    assert.equal(await Complaint.countDocuments(), 1);
  });

  it('operators and viewers see only their own', async () => {
    await raise('desk', { title: 'Desk one', description: 'x' });
    const opsOwn = await raise('ops', { title: 'Ops one', description: 'x' });
    await raise('look', { title: 'Look one', description: 'x' });
    assert.deepEqual((await list('desk')).body.items.map((c) => c.title), ['Desk one']);
    assert.deepEqual((await list('look')).body.items.map((c) => c.title), ['Look one']);
    const theirs = await as.desk.get(`/api/v1/tenants/powerfuel/complaints/${opsOwn.body.complaint.number}`);
    assert.equal(theirs.status, 404);
    assert.equal(theirs.body.error, 'not_found');
    const own = await as.ops.get(`/api/v1/tenants/powerfuel/complaints/${opsOwn.body.complaint.number}`);
    assert.equal(own.status, 200);
    assert.equal(own.body.complaint.created_by.name, 'op@powerfuel.example', 'no name: the email');
  });

  it('tenant_admin sees the whole tenant, staff see all', async () => {
    await raise('desk', { title: 'Desk one', description: 'x' });
    await raise('look', { title: 'Look one', description: 'x' });
    await raise('boss', { title: 'Globex one', description: 'x' });
    assert.deepEqual((await list('owner')).body.items.map((c) => c.title), ['Look one', 'Desk one']);
    assert.equal((await list('owner', '', 'globex')).status, 404);
    assert.equal((await as.boss.get('/api/v1/tenants/powerfuel/complaints/1')).status, 404);

    const all = await as.staff.get('/api/v1/complaints');
    assert.equal(all.status, 200);
    assert.deepEqual(all.body.items.map((c) => [c.tenant_id, c.tenant_name, c.title]), [
      ['globex', 'Globex Fitness', 'Globex one'],
      ['powerfuel', 'PowerFuel Gym', 'Look one'],
      ['powerfuel', 'PowerFuel Gym', 'Desk one'],
    ]);
    assert.equal(all.body.items[0].created_by.email, 'boss@globex.example');
    const globex = await as.staff.get('/api/v1/complaints?tenant=globex');
    assert.deepEqual(globex.body.items.map((c) => c.title), ['Globex one']);
    assert.deepEqual((await list('staff', '', 'powerfuel')).body.items.map((c) => c.title), ['Look one', 'Desk one']);
    for (const who of ['owner', 'desk', 'look']) assert.equal((await as[who].get('/api/v1/complaints')).status, 403, who);
  });

  it('status filter and newest activity first', async () => {
    for (let i = 1; i <= 5; i += 1) assert.equal((await raise('owner', { title: `No. ${i}`, description: 'x' })).status, 201);
    // No. 2 has the newest activity, No. 4 is closed (SRV-51 writes these through the API).
    await Complaint.updateOne({ number: 2 }, { last_activity_at: new Date(Date.now() + 60_000) });
    await Complaint.updateOne({ number: 4 }, { status: 'closed' });
    assert.deepEqual((await list('owner')).body.items.map((c) => c.title), ['No. 2', 'No. 5', 'No. 4', 'No. 3', 'No. 1']);
    assert.deepEqual((await list('owner', '?status=closed')).body.items.map((c) => c.title), ['No. 4']);
    assert.deepEqual((await list('owner', '?status=open,with_service')).body.items.map((c) => c.title),
      ['No. 2', 'No. 5', 'No. 3', 'No. 1']);
    assert.equal((await list('owner', '?status=pending')).body.error, 'invalid_status');

    const seen = [];
    let cursor = '';
    for (let page = 0; page < 3; page += 1) {
      const res = await list('owner', `?limit=2${cursor ? `&cursor=${cursor}` : ''}`);
      seen.push(...res.body.items.map((c) => c.title));
      cursor = res.body.next_cursor;
      if (!cursor) break;
    }
    assert.deepEqual(seen, ['No. 2', 'No. 5', 'No. 4', 'No. 3', 'No. 1'], 'two pages and a last one, no gaps or repeats');
    assert.equal((await list('owner', '?cursor=bogus')).body.error, 'invalid_cursor');
  });

  it('tenant view hides staff email', async () => {
    const { number } = (await raise('desk')).body.complaint;
    await Complaint.updateOne({ number }, { $push: { events: {
      at: new Date(), kind: 'comment', user_id: ids.staff, name: 'Ops', email: 'ops@fuelbot.example',
      fuelbot: true, text: 'Looking into it',
    } } });
    const tenant = await as.desk.get(`/api/v1/tenants/powerfuel/complaints/${number}`);
    assert.deepEqual(tenant.body.complaint.events.map((e) => e.author), [{ name: 'Ops', fuelbot: true }]);
    assert.ok(!JSON.stringify(tenant.body).includes('fuelbot.example'));
    assert.ok(!JSON.stringify(tenant.body).includes(String(ids.staff)), 'no user ids');
    assert.equal(tenant.body.complaint.comment_count, 1);
    const listed = await list('desk');
    assert.equal(listed.body.items[0].comment_count, 1);
    assert.ok(!('events' in listed.body.items[0]), 'lists carry no thread');

    const platform = await as.staff.get(`/api/v1/tenants/powerfuel/complaints/${number}`);
    assert.deepEqual(platform.body.complaint.events[0].author,
      { name: 'Ops', fuelbot: true, email: 'ops@fuelbot.example' });
    assert.equal(platform.body.complaint.created_by.email, 'desk@powerfuel.example');
  });

  it('an unknown or malformed number is 404', async () => {
    await raise('owner');
    for (const n of ['2', '0', '-1', '1.5', 'abc', '01']) {
      assert.equal((await as.owner.get(`/api/v1/tenants/powerfuel/complaints/${n}`)).status, 404, n);
    }
  });
});
