// A local, persistent MongoDB for development, with nothing to install: runs the mongod
// binary that mongodb-memory-server downloads, with its data in server/.data/.
//   npm run db [-- --port=27017]
import fs from 'node:fs';
import { MongoMemoryServer } from 'mongodb-memory-server';

const portArg = process.argv.find((a) => a.startsWith('--port='));
const port = portArg ? Number(portArg.slice(7)) : 27017;
const dbPath = new URL('../.data/', import.meta.url).pathname;
fs.mkdirSync(dbPath, { recursive: true });

const server = await MongoMemoryServer.create({
  instance: { port, ip: '127.0.0.1', dbPath, storageEngine: 'wiredTiger' },
});
console.log(`[db] MongoDB on ${server.getUri()} (data in server/.data/). Ctrl-C to stop.`);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await server.stop({ doCleanup: false });
    process.exit(0);
  });
}
