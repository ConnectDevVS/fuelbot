// Test harness: one in-memory MongoDB and app per test file.
//   const ctx = await startServer({ MACHINE_AUTH: 'required' });
//   request(ctx.app).get(...);   await ctx.reset();   await ctx.stop();
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { loadSettings } from '../src/settings.js';
import mongoose from 'mongoose';
import { connectDb, disconnectDb } from '../src/db.js';
import { createApp } from '../src/app.js';

export const TENANT = 'machine-042';

export async function startServer(env = {}) {
  const mongo = await MongoMemoryServer.create();
  const uploads = fs.mkdtempSync(path.join(os.tmpdir(), 'fuelbot-uploads-'));
  const settings = loadSettings({
    LOG_REQUESTS: 'false',
    JWT_SECRET: 'test-secret',
    MONGO_URL: mongo.getUri('fuelbot_test'),
    LOCAL_STORAGE_DIR: uploads,
    ...env,
  });
  await connectDb(settings.mongoUrl);
  const app = createApp({ settings });
  return {
    app,
    settings,
    uploads,
    async reset() {
      await Promise.all(Object.values(mongoose.models).map((model) => model.deleteMany({})));
    },
    async stop() {
      await disconnectDb();
      await mongo.stop();
      fs.rmSync(uploads, { recursive: true, force: true });
    },
  };
}

/** The mock's default catalog body (mockserver/responses/config/default.json), image URLs made https. */
export function mockCatalog() {
  const file = new URL('../../mockserver/responses/config/default.json', import.meta.url);
  const text = fs.readFileSync(file, 'utf8').replaceAll('{{origin}}/__mock/assets', 'https://cdn.example.com');
  return JSON.parse(text).body;
}
