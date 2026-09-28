// The browser tests' server (SRV-31): the real createApp on an in-memory MongoDB, fixed port 8795,
// serving the built dist/, seeded with e2e/seed.mjs. POST /__e2e/reset reseeds; it's added here
// by wrapping the listening server's handler, never in the server's createApp.
//   node e2e/server.mjs      (playwright.config.js starts it)
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { startServer } from '../../server/test/helpers.js';
import { reseed, seed } from './seed.mjs';

export const PORT = 8795;
const DIST = fileURLToPath(new URL('../dist/', import.meta.url));

function portFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer().once('error', () => resolve(false))
      .once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '127.0.0.1');
  });
}

if (!(await portFree(PORT))) {
  console.error(`[e2e] port ${PORT} is taken: another e2e server is running (or something else is). Stop it first.`);
  process.exit(1);
}

const ctx = await startServer({ DASHBOARD_DIR: DIST, LOG_REQUESTS: 'false', JWT_SECRET: 'e2e', MACHINE_AUTH: 'required' },
  { port: PORT });
await seed();

const [handler] = ctx.app.listeners('request');
ctx.app.removeAllListeners('request');
ctx.app.on('request', (req, res) => {
  if (req.method === 'POST' && req.url === '/__e2e/reset') {
    reseed(ctx).then(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
    }, (err) => {
      console.error('[e2e] reseed failed', err);
      res.writeHead(500).end();
    });
    return;
  }
  handler(req, res);
});
console.log(`[e2e] seeded server on http://127.0.0.1:${PORT}/dashboard/`);

let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    await ctx.stop();
    process.exit(0);
  });
}
