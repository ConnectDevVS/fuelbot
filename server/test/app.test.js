import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { startServer } from './helpers.js';
import { loadSettings } from '../src/settings.js';

describe('app basics', () => {
  let ctx;
  before(async () => { ctx = await startServer(); });
  after(async () => { await ctx.stop(); });

  it('healthz pings the database', async () => {
    const res = await request(ctx.app).get('/healthz');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
  });

  it('unknown routes are JSON 404s', async () => {
    const res = await request(ctx.app).get('/nope');
    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'not_found');
  });
});

describe('settings', () => {
  it('requires JWT_SECRET in production', () => {
    assert.throws(() => loadSettings({ NODE_ENV: 'production' }), /JWT_SECRET/);
  });

  it('rejects unknown MACHINE_AUTH and STORAGE values', () => {
    assert.throws(() => loadSettings({ MACHINE_AUTH: 'maybe' }), /MACHINE_AUTH/);
    assert.throws(() => loadSettings({ STORAGE: 'ftp' }), /STORAGE/);
  });

  it('defaults to required machine auth and local storage', () => {
    const s = loadSettings({});
    assert.equal(s.machineAuth, 'required');
    assert.equal(s.storage, 'local');
    assert.equal(s.port, 8790);
  });
});
