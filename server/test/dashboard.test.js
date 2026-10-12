import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { once } from 'node:events';
import { startServer } from './helpers.js';
import { loadSettings } from '../src/settings.js';
import { createApp } from '../src/app.js';

/**
 * A second app on its own settings, without a database: the dashboard routes don't use one, and
 * a second startServer() in this process would share (and close) the Mongoose connection.
 */
async function bareServer(env) {
  const server = createApp({ settings: loadSettings({ LOG_REQUESTS: 'false', JWT_SECRET: 't', ...env }) })
    .listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { app: server, stop: () => new Promise((resolve) => { server.close(resolve); }) };
}

const INDEX = '<!doctype html><html><head><meta name="csp-nonce" content="__CSP_NONCE__">'
  + '<meta name="fb-env" content="__ENV_LABEL__">'
  + '<script type="module" src="/dashboard/assets/app-abc123.js"></script></head><body><div id="root"></div></body></html>';

/** A fake build: index.html, favicon.svg, assets/app-abc123.js. */
function makeBuild() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuelbot-dashboard-'));
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'index.html'), INDEX);
  fs.writeFileSync(path.join(dir, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  fs.writeFileSync(path.join(dir, 'assets', 'app-abc123.js'), 'console.log(1);\n');
  return dir;
}

const directive = (csp, name) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `) || d === name);
const nonceOf = (res) => /'nonce-([^']+)'/.exec(res.headers['content-security-policy'])?.[1];
const metaEnv = (html) => /<meta name="fb-env" content="([^"]*)">/.exec(html)?.[1];
const metaNonce = (html) => /<meta name="csp-nonce" content="([^"]*)">/.exec(html)?.[1];

describe('/dashboard', () => {
  let ctx;
  let dir;

  before(async () => {
    dir = makeBuild();
    ctx = await startServer({ DASHBOARD_DIR: dir, S3_PUBLIC_BASE_URL: 'https://cdn.example.com/x',
      IMAGE_ORIGINS: 'https://img.example.org', PUBLIC_URL: 'http://192.168.1.20:8790' });
  });
  after(async () => {
    await ctx.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('serves index.html with the dashboard CSP', async () => {
    const res = await request(ctx.app).get('/dashboard/');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    const csp = res.headers['content-security-policy'];
    assert.ok(csp.includes("script-src 'self'"), csp);
    assert.match(directive(csp, 'style-src'), /^style-src 'self' 'nonce-[A-Za-z0-9+/=]{24}'$/);
    assert.ok(csp.includes("frame-ancestors 'none'"));
    assert.ok(csp.includes("object-src 'none'"));
    assert.ok(!csp.includes('unsafe-inline'), csp);
    assert.ok(!csp.includes('upgrade-insecure-requests'), 'not in dev');
    assert.equal(res.headers['cache-control'], 'no-store');
    assert.ok(res.text.includes('<div id="root">'));
  });

  it('a fresh nonce per request, the same in header and page', async () => {
    const a = await request(ctx.app).get('/dashboard/');
    const b = await request(ctx.app).get('/dashboard/');
    assert.ok(nonceOf(a) && nonceOf(b));
    assert.notEqual(nonceOf(a), nonceOf(b));
    for (const res of [a, b]) {
      assert.equal(metaNonce(res.text), nonceOf(res));
      assert.ok(!res.text.includes('__CSP_NONCE__'));
    }
    const direct = await request(ctx.app).get('/dashboard/index.html');
    assert.equal(direct.status, 200);
    assert.equal(metaNonce(direct.text), nonceOf(direct));
    assert.ok(!direct.text.includes('__CSP_NONCE__'));
    assert.equal(direct.headers['cache-control'], 'no-store');
  });

  it('hashed assets are immutable', async () => {
    const res = await request(ctx.app).get('/dashboard/assets/app-abc123.js');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /javascript/);
    assert.equal(res.headers['cache-control'], 'public, max-age=31536000, immutable');
    assert.ok(!nonceOf(res), 'static files carry no nonce');
    assert.equal(directive(res.headers['content-security-policy'], 'style-src'), "style-src 'self'");
    const icon = await request(ctx.app).get('/dashboard/favicon.svg');
    assert.equal(icon.status, 200);
    assert.equal(icon.headers['cache-control'], 'no-cache');
  });

  it('deep links fall back to index.html', async () => {
    const deep = await request(ctx.app).get('/dashboard/t/powerfuel/machines/DEV00001/stock');
    assert.equal(deep.status, 200);
    assert.equal(metaNonce(deep.text), nonceOf(deep));
    assert.equal(deep.headers['cache-control'], 'no-store');
    const missing = await request(ctx.app).get('/dashboard/assets/missing.js');
    assert.equal(missing.status, 404);
    assert.ok(!missing.text.includes('<html'));
    assert.equal((await request(ctx.app).post('/dashboard/x')).status, 404);
    assert.equal((await request(ctx.app).head('/dashboard/sales')).status, 200);
  });

  it('img-src follows the storage settings', async () => {
    const res = await request(ctx.app).get('/dashboard/');
    const img = directive(res.headers['content-security-policy'], 'img-src');
    assert.equal(img, "img-src 'self' data: https://cdn.example.com http://192.168.1.20:8790 https://img.example.org");
    for (const bad of ['http://img.example.org', 'https://img.example.org/path', 'img.example.org', 'https://a.io,nope']) {
      assert.throws(() => loadSettings({ IMAGE_ORIGINS: bad }), /IMAGE_ORIGINS/, bad);
    }
    assert.deepEqual(loadSettings({ IMAGE_ORIGINS: ' https://a.io , https://b.io/ ' }).imageOrigins,
      ['https://a.io', 'https://b.io']);
  });

  it('upgrade-insecure-requests only in production', async () => {
    const prod = await bareServer({ DASHBOARD_DIR: dir, NODE_ENV: 'production' });
    try {
      const res = await request(prod.app).get('/dashboard/');
      assert.ok(res.headers['content-security-policy'].includes('upgrade-insecure-requests'));
    } finally {
      await prod.stop();
    }
  });

  it('ENV_LABEL fills the fb-env meta; none by default', async () => {
    assert.equal(metaEnv((await request(ctx.app).get('/dashboard/')).text), '');
    const staging = await bareServer({ DASHBOARD_DIR: dir, ENV_LABEL: ' staging ' });
    try {
      for (const url of ['/dashboard/', '/dashboard/t/powerfuel/home']) {
        const res = await request(staging.app).get(url);
        assert.equal(metaEnv(res.text), 'staging', url);
        assert.ok(!res.text.includes('__ENV_LABEL__'));
      }
    } finally {
      await staging.stop();
    }
    assert.equal(loadSettings({ ENV_LABEL: 'Dev 2_test-1.0' }).envLabel, 'Dev 2_test-1.0');
    for (const bad of ['"><script>', 'stag<ing', 'a'.repeat(25), '-x', 'stag\ning']) {
      assert.throws(() => loadSettings({ ENV_LABEL: bad }), /ENV_LABEL/, bad);
    }
  });

  it('not built → 503 page', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'fuelbot-empty-'));
    const bare = await bareServer({ DASHBOARD_DIR: empty });
    try {
      for (const url of ['/dashboard/', '/dashboard/t/powerfuel/home', '/dashboard/assets/app.js']) {
        const res = await request(bare.app).get(url);
        assert.equal(res.status, 503, url);
        assert.match(res.headers['content-type'], /text\/html/);
        assert.ok(res.text.includes('npm run build'));
      }
    } finally {
      await bare.stop();
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });

  it('API CSP unchanged, / redirects', async () => {
    const health = await request(ctx.app).get('/healthz');
    const csp = health.headers['content-security-policy'];
    assert.ok(csp.includes("default-src 'self'"));
    assert.ok(csp.includes("style-src 'self' https: 'unsafe-inline'"), 'helmet\'s default');
    assert.ok(!csp.includes('nonce-'));
    const root = await request(ctx.app).get('/');
    assert.equal(root.status, 302);
    assert.equal(root.headers.location, '/dashboard/');
    const bare = await request(ctx.app).get('/dashboard');
    assert.equal(bare.status, 301);
    assert.equal(bare.headers.location, '/dashboard/');
    assert.equal((await request(ctx.app).get('/api/v1/nope')).status, 401, 'the API as before: session first');
  });
});
