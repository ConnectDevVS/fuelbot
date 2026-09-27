import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { mockConfig, startServer } from './helpers.js';
import { Machine, Product, Tenant } from '../src/models/index.js';
import { importConfig } from '../src/services/catalog.js';

const run = promisify(execFile);
const SERVER_DIR = new URL('..', import.meta.url).pathname;
const ids = (tenant = 'powerfuel', machine = 'machine-042') => ({ 'X-Tenant-Id': tenant, 'X-Machine-Id': machine });

describe('GET /fuelbot/config', () => {
  let ctx;
  before(async () => { ctx = await startServer(); });
  after(async () => { await ctx.stop(); });
  beforeEach(async () => {
    await ctx.reset();
    await importConfig({ tenantId: 'powerfuel', tenantName: 'PowerFuel Gym', machineId: 'machine-042',
      config: mockConfig('default') });
  });

  it('serves the machine config in the app schema (contract test 1, over HTTP)', async () => {
    const res = await request(ctx.app).get('/fuelbot/config').set(ids());
    assert.equal(res.status, 200);
    assert.equal(res.headers['cache-control'], 'no-store');
    const { version, ...body } = res.body;
    const { version: _v, ...expected } = mockConfig('default');
    assert.ok(Number.isInteger(version) && version >= 2);
    assert.deepEqual(body, expected);
  });

  it('401 machine_unidentified without both ids', async () => {
    for (const headers of [{}, { 'X-Tenant-Id': 'powerfuel' }, { 'X-Machine-Id': 'machine-042' },
      { 'X-Tenant-Id': ' ', 'X-Machine-Id': 'machine-042' }]) {
      const res = await request(ctx.app).get('/fuelbot/config').set(headers);
      assert.equal(res.status, 401, JSON.stringify(headers));
      assert.equal(res.body.error, 'machine_unidentified');
    }
  });

  it('404 unknown_machine for an unregistered machine or another tenant\'s', async () => {
    let res = await request(ctx.app).get('/fuelbot/config').set(ids('powerfuel', 'machine-999'));
    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'unknown_machine');
    res = await request(ctx.app).get('/fuelbot/config').set(ids('othergym', 'machine-042'));
    assert.equal(res.status, 404);
  });

  it('403 for a disabled machine or tenant', async () => {
    await Machine.updateOne({ _id: 'machine-042' }, { disabled: true });
    let res = await request(ctx.app).get('/fuelbot/config').set(ids());
    assert.equal(res.status, 403);
    assert.equal(res.body.error, 'machine_disabled');
    await Machine.updateOne({ _id: 'machine-042' }, { disabled: false });
    await Tenant.updateOne({ _id: 'powerfuel' }, { disabled: true });
    res = await request(ctx.app).get('/fuelbot/config').set(ids());
    assert.equal(res.status, 403);
    assert.equal(res.body.error, 'tenant_disabled');
  });

  it('records last seen for a known machine', async () => {
    assert.equal((await Machine.findById('machine-042')).last_seen_at, null);
    await request(ctx.app).get('/fuelbot/config').set(ids()).expect(200);
    let seen = null;
    for (let i = 0; i < 50 && !seen; i += 1) {
      seen = (await Machine.findById('machine-042')).last_seen_at;
      if (!seen) await new Promise((r) => setTimeout(r, 20));
    }
    assert.ok(seen instanceof Date);
    assert.ok(Date.now() - seen.getTime() < 5000);
  });

  it('the version goes up when a product or the menu changes', async () => {
    const v1 = (await request(ctx.app).get('/fuelbot/config').set(ids())).body.version;
    const guava = await Product.findOne({ product_id: 'guava' });
    guava.name = 'Guava Blast';
    guava.rev += 1;
    await guava.save();
    await Tenant.updateOne({ _id: 'powerfuel' }, { $inc: { catalog_version: 1 } });
    const res = await request(ctx.app).get('/fuelbot/config').set(ids());
    assert.equal(res.body.flavors[0].name, 'Guava Blast');
    assert.equal(res.body.version, v1 + 1);
  });
});

describe('scripts: seed and import-config', () => {
  let ctx;
  before(async () => { ctx = await startServer(); });
  after(async () => { await ctx.stop(); });
  beforeEach(async () => { await ctx.reset(); });

  const env = () => ({ ...process.env, MONGO_URL: ctx.settings.mongoUrl });

  it('seed creates powerfuel / DEV00001 without image URLs, and can re-run', async () => {
    await run('node', ['scripts/seed.js'], { cwd: SERVER_DIR, env: env() });
    await run('node', ['scripts/seed.js'], { cwd: SERVER_DIR, env: env() });
    const res = await request(ctx.app).get('/fuelbot/config').set(ids('powerfuel', 'DEV00001'));
    assert.equal(res.status, 200);
    assert.equal(res.body.flavors.length, 6);
    assert.ok(res.body.flavors.every((f) => !('image_url' in f) && f.image.startsWith('res://')));
    assert.equal(await Machine.countDocuments(), 1);
  });

  it('import-config imports a plain config file and refuses an invalid one', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuelbot-import-'));
    const good = path.join(dir, 'good.json');
    const bad = path.join(dir, 'bad.json');
    fs.writeFileSync(good, JSON.stringify(mockConfig('default')));
    fs.writeFileSync(bad, JSON.stringify(mockConfig('invalid_duplicate_hopper')));
    try {
      const { stdout } = await run('node', ['scripts/import-config.js', '--tenant=acme',
        '--tenant-name=Acme Fitness', good], { cwd: SERVER_DIR, env: env() });
      const id = /machine ([A-Z0-9]{8})\./.exec(stdout)?.[1];
      assert.ok(id, `a generated machine id in: ${stdout}`);
      assert.equal((await Machine.findById(id)).tenant_id, 'acme');
      const again = await run('node', ['scripts/import-config.js', '--tenant=acme', `--machine=${id}`, good],
        { cwd: SERVER_DIR, env: env() });
      assert.match(again.stdout, new RegExp(`machine ${id}\\.`));
      assert.equal(await Machine.countDocuments({ tenant_id: 'acme' }), 1);
      assert.equal((await Tenant.findById('acme')).name, 'Acme Fitness');
      await assert.rejects(
        run('node', ['scripts/import-config.js', '--tenant=acme', '--machine=ACME0002', bad], { cwd: SERVER_DIR, env: env() }),
        (err) => err.code === 1 && /chocolate: hopper 1 already used by guava/.test(err.stderr),
      );
      assert.equal(await Machine.countDocuments({ _id: 'ACME0002' }), 0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
