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
    staff2: { email: 'support@fuelbot.example', name: 'Support', role: 'platform_admin' },
    owner: { email: 'owner@powerfuel.example', name: 'Owner', role: 'tenant_admin', tenant_id: 'powerfuel' },
    desk: { email: 'desk@powerfuel.example', name: 'Desk', role: 'operator', tenant_id: 'powerfuel', machines: ['PF1'] },
    ops: { email: 'op@powerfuel.example', name: '', role: 'operator', tenant_id: 'powerfuel' },
    look: { email: 'look@powerfuel.example', name: 'Look', role: 'viewer', tenant_id: 'powerfuel' },
    boss: { email: 'boss@globex.example', name: 'Boss', role: 'tenant_admin', tenant_id: 'globex' },
  };
  const ids = {};
  const raise = (who, body = RAISE, tid = users[who].tenant_id) => as[who].post(`/api/v1/tenants/${tid}/complaints`, body);
  const list = (who, query = '', tid = users[who].tenant_id) => as[who].get(`/api/v1/tenants/${tid}/complaints${query}`);
  const url = (n, tid = 'powerfuel') => `/api/v1/tenants/${tid}/complaints/${n}`;
  const comment = (who, n, text = 'More detail', tid) => as[who].post(`${url(n, tid)}/comments`, { text });
  const setStatus = (who, n, from, to, text = 'Because') => as[who].post(`${url(n)}/status`, { from, to, text });
  const raised = async (who) => (await raise(who)).body.complaint.number;

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
  // --- SRV-51: comments, status changes, reopen ---------------------------------------------------

  it('creator and tenant_admin comment; staff comment', async () => {
    const n = await raised('desk');
    const first = (await Complaint.findOne({ number: n }).lean()).last_activity_at;
    for (const who of ['desk', 'owner', 'staff']) {
      const res = await comment(who, n, `  From ${who}  `);
      assert.equal(res.status, 201, `${who}: ${JSON.stringify(res.body)}`);
    }
    const saved = await Complaint.findOne({ number: n }).lean();
    assert.deepEqual(saved.events.map((e) => [e.kind, e.email, e.fuelbot, e.text]), [
      ['comment', 'desk@powerfuel.example', false, 'From desk'],
      ['comment', 'owner@powerfuel.example', false, 'From owner'],
      ['comment', 'ops@fuelbot.example', true, 'From staff'],
    ]);
    assert.ok(saved.last_activity_at > first);
    assert.equal(saved.status, 'open');
    const view = (await as.desk.get(url(n))).body.complaint;
    assert.equal(view.comment_count, 3);
    assert.deepEqual(view.events.map((e) => e.author), [
      { name: 'Desk', fuelbot: false }, { name: 'Owner', fuelbot: false }, { name: 'Ops', fuelbot: true },
    ]);
    assert.equal(await AuditEntry.countDocuments({ action: 'complaint.comment', target: `complaint:${n}` }), 3);
    const audit = await AuditEntry.findOne({ action: 'complaint.comment' }).lean();
    assert.equal(audit.after, undefined, 'no comment text in the audit log');
  });

  it('out of scope can\'t comment', async () => {
    const n = await raised('desk');
    assert.equal((await comment('ops', n)).status, 404);
    assert.equal((await comment('look', n)).status, 404);
    assert.equal((await comment('boss', n, 'x', 'powerfuel')).status, 404);
    assert.equal((await Complaint.findOne({ number: n }).lean()).events.length, 0);
  });

  it('comment validation', async () => {
    const n = await raised('desk');
    for (const body of [{}, { text: '' }, { text: '   ' }, { text: 'x'.repeat(2001) }, { text: 'x', extra: 1 }]) {
      const res = await as.desk.post(`${url(n)}/comments`, body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(res.body.error, 'invalid_body');
    }
    assert.equal((await comment('desk', n, 'x'.repeat(2000))).status, 201);
  });

  it('comments on a closed complaint keep it closed', async () => {
    const n = await raised('desk');
    assert.equal((await setStatus('staff', n, 'open', 'closed')).status, 201);
    const res = await comment('desk', n, 'Still happening?');
    assert.equal(res.status, 201);
    assert.equal(res.body.complaint.status, 'closed');
  });

  it('staff change status in any direction with a comment', async () => {
    const n = await raised('desk');
    const steps = [['open', 'with_service'], ['with_service', 'closed'], ['closed', 'open'], ['open', 'closed'],
      ['closed', 'with_service'], ['with_service', 'open']];
    for (const [from, to] of steps) {
      const res = await setStatus('staff', n, from, to, `  ${from} to ${to}  `);
      assert.equal(res.status, 201, `${from} → ${to}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.complaint.status, to);
    }
    const saved = await Complaint.findOne({ number: n }).lean();
    assert.deepEqual(saved.events.map((e) => [e.kind, e.from, e.to, e.text, e.fuelbot]),
      steps.map(([from, to]) => ['status', from, to, `${from} to ${to}`, true]));
    const audits = await AuditEntry.find({ action: 'complaint.status' }).sort({ _id: 1 }).lean();
    assert.deepEqual(audits.map((a) => [a.before.status, a.after.status, a.target]),
      steps.map(([from, to]) => [from, to, `complaint:${n}`]));
    const view = (await as.desk.get(url(n))).body.complaint;
    assert.equal(view.comment_count, 0, 'status changes aren\'t counted as comments');
    assert.deepEqual(view.events[0], { ...view.events[0], kind: 'status', from: 'open', to: 'with_service' });
  });

  it('a status change without a comment is refused', async () => {
    const n = await raised('desk');
    for (const body of [{ from: 'open', to: 'closed' }, { from: 'open', to: 'closed', text: '' },
      { from: 'open', to: 'closed', text: '   ' }]) {
      const res = await as.staff.post(`${url(n)}/status`, body);
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'invalid_body');
      assert.ok(res.body.details.some((d) => d.field === 'text'), JSON.stringify(res.body.details));
    }
    for (const body of [{ to: 'closed', text: 'x' }, { from: 'open', to: 'done', text: 'x' }]) {
      assert.equal((await as.staff.post(`${url(n)}/status`, body)).body.error, 'invalid_body', JSON.stringify(body));
    }
    assert.equal((await Complaint.findOne({ number: n }).lean()).status, 'open');
  });

  it('stale from is 409', async () => {
    const n = await raised('desk');
    const [a, b] = await Promise.all([setStatus('staff', n, 'open', 'with_service', 'Mine'),
      setStatus('staff2', n, 'open', 'closed', 'Theirs')]);
    const statuses = [a.status, b.status].sort();
    assert.deepEqual(statuses, [201, 409]);
    const lost = a.status === 409 ? a : b;
    const won = a.status === 409 ? b : a;
    assert.equal(lost.body.error, 'status_changed');
    assert.equal(lost.body.details.status, won.body.complaint.status);
    assert.equal((await Complaint.findOne({ number: n }).lean()).events.length, 1);
  });

  it('same status is 400 status_unchanged', async () => {
    const n = await raised('desk');
    const res = await setStatus('staff', n, 'open', 'open');
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'status_unchanged');
  });

  it('creator and tenant_admin reopen a closed complaint', async () => {
    const n = await raised('desk');
    for (const who of ['desk', 'owner']) {
      assert.equal((await setStatus('staff', n, 'open', 'closed')).status, 201);
      const res = await setStatus(who, n, 'closed', 'open', 'It came back');
      assert.equal(res.status, 201, `${who}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.complaint.status, 'open');
      assert.equal(res.body.complaint.events.at(-1).author.fuelbot, false);
    }
    assert.equal((await setStatus('staff', n, 'open', 'closed')).status, 201);
    assert.equal((await setStatus('ops', n, 'closed', 'open')).status, 404, 'a colleague can\'t see it');
    assert.equal((await setStatus('boss', n, 'closed', 'open')).status, 404);
  });

  it('tenant users can\'t set other statuses', async () => {
    const n = await raised('desk');
    for (const to of ['closed', 'with_service']) {
      const res = await setStatus('desk', n, 'open', to);
      assert.equal(res.status, 403, to);
      assert.equal(res.body.error, 'forbidden');
    }
    assert.equal((await setStatus('desk', n, 'open', 'open')).body.error, 'status_unchanged');
    assert.equal((await setStatus('owner', n, 'open', 'closed')).status, 403, 'not even a tenant_admin');
    assert.equal((await setStatus('desk', n, 'closed', 'open')).body.error, 'status_changed', 'it isn\'t closed');
    assert.equal((await Complaint.findOne({ number: n }).lean()).status, 'open');
  });

  it('a full thread is 409 complaint_full', async () => {
    const n = await raised('desk');
    const filler = Array.from({ length: 300 }, () => ({ at: new Date(), kind: 'comment', user_id: ids.desk, name: 'Desk',
      email: 'desk@powerfuel.example', text: 'x' }));
    await Complaint.updateOne({ number: n }, { $push: { events: { $each: filler } } });
    const c = await comment('desk', n);
    assert.equal(c.status, 409);
    assert.equal(c.body.error, 'complaint_full');
    const s = await setStatus('staff', n, 'open', 'closed');
    assert.equal(s.body.error, 'complaint_full');
    const saved = await Complaint.findOne({ number: n }).lean();
    assert.equal(saved.events.length, 300);
    assert.equal(saved.status, 'open');
  });
});
