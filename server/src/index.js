// Entry point: settings → database → app → listen.
import { loadSettings } from './settings.js';
import { connectDb, disconnectDb } from './db.js';
import { createApp } from './app.js';
import { dashboardBuilt } from './dashboard.js';

const settings = loadSettings();
if (!process.env.JWT_SECRET && !settings.production) {
  console.warn('[server] JWT_SECRET not set: using a random one (dashboard sessions end on restart)');
}
if (!dashboardBuilt(settings)) console.warn(`[dashboard] not built: ${settings.dashboardDir}`);
await connectDb(settings.mongoUrl);
const app = createApp({ settings });
const server = app.listen(settings.port, settings.host, () => {
  console.log(`[server] listening on http://${settings.host}:${settings.port} ` +
    `(machine auth: ${settings.machineAuth}, storage: ${settings.storage})`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => disconnectDb().then(() => process.exit(0)));
  });
}
