import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeSale, makeUser, mockConfig, signIn, startServer } from './helpers.js';
import { Tenant } from '../src/models/index.js';
import { importConfig } from '../src/services/catalog.js';
import { csvCell } from '../src/routes/sales.js';

const TENANT_FORBIDDEN = ['dispensing_result', 'dispensing_reason', 'extra', 'machine_known', 'body_tenant_id',
  'body_machine_id', 'received_at', 'tenant_id'];

describe('csvCell', () => {
  it('quotes per RFC 4180 and defuses formulas', () => {
    assert.equal(csvCell('plain'), 'plain');
    assert.equal(csvCell('a,b'), '"a,b"');
    assert.equal(csvCell('say "hi"'), '"say ""hi"""');
    assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
    assert.equal(csvCell('+1'), "'+1");
    assert.equal(csvCell(null), '');
    assert.equal(csvCell(new Date('2026-09-27T10:00:00Z')), '2026-09-27T10:00:00.000Z');
  });
});

describe('/api/v1/sales', () => {
  let ctx;
  let other;
  const as = {};

  before(async () => { ctx = await startServer(); });
  after(async () => { await ctx.stop(); });
  beforeEach(async () => {
    await ctx.reset();
    await importConfig({ tenantId: 'powerfuel', tenantName: 'PowerFuel Gym', machineId: 'DEV00001', config: mockConfig() });
    other = (await importConfig({ tenantId: 'powerfuel', config: mockConfig() })).machine._id;
    await Tenant.create({ _id: 'globex', name: 'Globex' });
    // Two IST days: 26 Sep (two sales) and 27 Sep 00:30 IST = 26 Sep 19:00 UTC (one).
    await makeSale({ order_id: 'a1', ts: new Date('2026-09-26T04:00:00Z'), charged_price: 75 });
    await makeSale({ order_id: 'a2', ts: new Date('2026-09-26T05:00:00Z'), charged_price: 180, flavor_id: 'chocolate',
      dispensing_result: 'timeout', dispensing_reason: 'deadline', extra: { note: 'x' } });
    await makeSale({ order_id: 'a3', ts: new Date('2026-09-26T19:00:00Z'), charged_price: 35, flavor_id: 'electro',
      machine_id: other });
    await makeSale({ order_id: 'g1', tenant_id: 'globex', machine_id: 'GLOBEX01', ts: new Date('2026-09-26T06:00:00Z') });
    const users = {
      ops: { email: 'ops@x.io', role: 'platform_admin' },
      owner: { email: 'owner@x.io', role: 'tenant_admin', tenant_id: 'powerfuel' },
      opOne: { email: 'op1@x.io', role: 'operator', tenant_id: 'powerfuel', machines: ['DEV00001'] },
      viewer: { email: 'v@x.io', role: 'viewer', tenant_id: 'powerfuel' },
    };
    for (const [key, fields] of Object.entries(users)) {
      await makeUser(fields);
      as[key] = await signIn(ctx.app, fields.email);
    }
  });

  it('lists newest first by client time, scoped per user', async () => {
    const all = await as.ops.get('/api/v1/sales');
    assert.deepEqual(all.body.items.map((s) => s.order_id), ['a3', 'g1', 'a2', 'a1']);
    const mine = await as.owner.get('/api/v1/sales');
    assert.deepEqual(mine.body.items.map((s) => s.order_id), ['a3', 'a2', 'a1']);
    const limited = await as.opOne.get('/api/v1/sales');
    assert.deepEqual(limited.body.items.map((s) => s.order_id), ['a2', 'a1']);
  });

  it('tenant users get "dispensed", never the reason or other platform fields', async () => {
    const [a2] = (await as.viewer.get('/api/v1/sales?flavor=chocolate')).body.items;
    assert.equal(a2.dispensed, false);
    for (const key of TENANT_FORBIDDEN) assert.ok(!(key in a2), key);
    assert.ok(!JSON.stringify(a2).includes('deadline'));
    const [p2] = (await as.ops.get('/api/v1/sales?flavor=chocolate')).body.items;
    assert.equal(p2.dispensing_result, 'timeout');
    assert.equal(p2.dispensing_reason, 'deadline');
    assert.equal(p2.dispensed, false);
  });

  it('filters: machine, flavor, dispensed, time; result is platform-only; scope is enforced', async () => {
    const ids = async (who, q) => (await as[who].get(`/api/v1/sales?${q}`)).body.items.map((s) => s.order_id);
    assert.deepEqual(await ids('owner', `machine=${other}`), ['a3']);
    assert.deepEqual(await ids('owner', 'dispensed=false'), ['a2']);
    assert.deepEqual(await ids('owner', 'dispensed=true'), ['a3', 'a1']);
    assert.deepEqual(await ids('owner', 'from=2026-09-26T04:30:00Z&to=2026-09-26T19:00:00Z'), ['a2']);
    assert.deepEqual(await ids('ops', 'result=timeout'), ['a2']);
    assert.equal((await as.owner.get('/api/v1/sales?result=timeout')).body.error, 'unknown_filter');
    assert.equal((await as.owner.get('/api/v1/sales?tenant=globex')).status, 404);
    assert.equal((await as.opOne.get(`/api/v1/sales?machine=${other}`)).status, 404);
    assert.equal((await as.owner.get('/api/v1/sales?from=yesterday')).body.error, 'invalid_from');
    assert.equal((await as.owner.get('/api/v1/sales?dispensed=maybe')).body.error, 'invalid_dispensed');
  });

  it('pages by client time with a cursor', async () => {
    const seen = [];
    let cursor = null;
    do {
      const res = await as.ops.get(`/api/v1/sales?limit=1${cursor ? `&cursor=${cursor}` : ''}`);
      seen.push(...res.body.items.map((s) => s.order_id));
      cursor = res.body.next_cursor;
    } while (cursor);
    assert.deepEqual(seen, ['a3', 'g1', 'a2', 'a1']);
    assert.equal((await as.ops.get('/api/v1/sales?cursor=junk')).body.error, 'invalid_cursor');
  });

  it('summary by IST day, flavor and machine; by tenant for platform only', async () => {
    const day = (await as.owner.get('/api/v1/sales/summary?group=day')).body;
    assert.equal(day.tz, 'Asia/Kolkata');
    assert.deepEqual(day.items, [
      { key: '2026-09-26', count: 2, revenue: 255, not_dispensed: 1, not_dispensed_amount: 180 },
      { key: '2026-09-27', count: 1, revenue: 35, not_dispensed: 0, not_dispensed_amount: 0 },
    ]);
    assert.deepEqual(day.totals, { count: 3, revenue: 290, not_dispensed: 1, not_dispensed_amount: 180 });
    const flavor = (await as.owner.get('/api/v1/sales/summary?group=flavor')).body.items;
    assert.deepEqual(flavor.map((r) => r.key), ['chocolate', 'guava', 'electro'], 'by revenue');
    const machine = (await as.opOne.get('/api/v1/sales/summary?group=machine')).body.items;
    assert.deepEqual(machine.map((r) => r.key), ['DEV00001']);
    assert.equal((await as.owner.get('/api/v1/sales/summary?group=tenant')).status, 403);
    const tenants = (await as.ops.get('/api/v1/sales/summary?group=tenant')).body.items;
    assert.deepEqual(tenants.map((r) => r.key).sort(), ['globex', 'powerfuel']);
    assert.equal((await as.owner.get('/api/v1/sales/summary?group=hour')).body.error, 'invalid_group');
  });

  it('CSV export streams the caller\'s view', async () => {
    const res = await as.viewer.get('/api/v1/sales/export.csv');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/csv/);
    assert.match(res.headers['content-disposition'], /attachment; filename="sales-\d{4}-\d\d-\d\d\.csv"/);
    const lines = res.text.trim().split('\r\n');
    assert.equal(lines[0], 'local_time,ts,order_id,order_number,machine_id,flavor_id,base_id,actual_price,offer_price,charged_price,'
      + 'currency,payment_method,transaction_id,dispensed');
    assert.equal(lines.length, 4);
    assert.ok(!res.text.includes('timeout') && !res.text.includes('deadline'));
    assert.ok(lines.some((l) => l.includes(',a2,') && l.endsWith(',false')));
    const platform = await as.ops.get('/api/v1/sales/export.csv?dispensed=false');
    assert.match(platform.text, /dispensing_result/);
    assert.equal(platform.text.trim().split('\r\n').length, 2);
  });
  const keysOf = async (who, q) => (await as[who].get(`/api/v1/sales/summary?${q}`)).body;

  it('summary groups by ISO week in DISPLAY_TZ', async () => {
    await ctx.reset();
    await makeSale({ order_id: 'w1', ts: new Date('2026-09-27T18:29:59Z'), charged_price: 75 });   // Sun 23:59:59 IST
    await makeSale({ order_id: 'w2', ts: new Date('2026-09-27T18:30:00Z'), charged_price: 90 });   // Mon 00:00 IST
    await makeUser({ email: 'wk@x.io', role: 'platform_admin' });
    as.wk = await signIn(ctx.app, 'wk@x.io');
    const body = await keysOf('wk', 'group=week');
    assert.equal(body.group, 'week');
    assert.deepEqual(body.items.map((r) => [r.key, r.count, r.revenue]), [['2026-W39', 1, 75], ['2026-W40', 1, 90]]);
  });

  it('ISO week-year edges', async () => {
    await ctx.reset();
    // Inserted out of order: the response sorts them.
    await makeSale({ order_id: 'e3', ts: new Date('2027-01-03T18:30:00Z') });   // Mon 4 Jan 2027 IST
    await makeSale({ order_id: 'e1', ts: new Date('2025-12-29T00:00:00Z') });   // Mon 29 Dec 2025 IST
    await makeSale({ order_id: 'e2', ts: new Date('2026-12-31T18:30:00Z') });   // Fri 1 Jan 2027 IST
    await makeUser({ email: 'edge@x.io', role: 'platform_admin' });
    as.edge = await signIn(ctx.app, 'edge@x.io');
    const keys = (await keysOf('edge', 'group=week')).items.map((r) => r.key);
    assert.deepEqual(keys, ['2026-W01', '2026-W53', '2027-W01']);
  });

  it('summary groups by month in DISPLAY_TZ', async () => {
    await makeSale({ order_id: 'm1', ts: new Date('2026-09-30T18:29:59Z'), charged_price: 50 });
    await makeSale({ order_id: 'm2', ts: new Date('2026-09-30T18:30:00Z'), charged_price: 60,
      dispensing_result: 'rejected' });
    const month = await keysOf('owner', 'group=month');
    assert.deepEqual(month.items.map((r) => [r.key, r.count]), [['2026-09', 4], ['2026-10', 1]]);
    const day = await keysOf('owner', 'group=day');
    assert.deepEqual(month.totals, day.totals);
    assert.deepEqual((await keysOf('owner', 'group=week')).totals, day.totals);
  });

  it('week and month respect scope and filters', async () => {
    const week = await keysOf('opOne', 'group=week');
    assert.deepEqual(week.items, [
      { key: '2026-W39', count: 2, revenue: 255, not_dispensed: 1, not_dispensed_amount: 180 },
    ]);
    const month = await keysOf('owner', 'group=month&dispensed=false');
    assert.deepEqual(month.items.map((r) => [r.key, r.count, r.revenue]), [['2026-09', 1, 180]]);
    assert.equal((await as.owner.get('/api/v1/sales/summary?group=week&tenant=globex')).status, 404);
    const everyone = await keysOf('ops', 'group=month');
    assert.equal(everyone.totals.count, 4);
  });

  it('CSV starts with local_time in DISPLAY_TZ', async () => {
    await makeSale({ order_id: 'lt1', ts: new Date('2026-09-28T07:12:02Z') });
    for (const who of ['ops', 'viewer']) {
      const lines = (await as[who].get('/api/v1/sales/export.csv')).text.trim().split('\r\n');
      assert.ok(lines[0].startsWith('local_time,ts,'), `${who}: ${lines[0]}`);
      const row = lines.find((l) => l.includes(',lt1,'));
      assert.ok(row.startsWith('2026-09-28 12:42:02,2026-09-28T07:12:02.000Z,'), `${who}: ${row}`);
    }
  });
});
