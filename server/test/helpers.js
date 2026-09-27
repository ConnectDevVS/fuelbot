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
    BCRYPT_COST: '4',
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

const isIdList = (v) => Array.isArray(v) && v.length > 0
  && v.every((x) => x !== null && typeof x === 'object' && 'id' in x);

/** mockserver/server.py deep_merge: objects recurse, arrays of {id} merge by id, else replace. */
function deepMerge(base, patch) {
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (isObj(base) && isObj(patch)) {
    const out = structuredClone(base);
    for (const [k, v] of Object.entries(patch)) out[k] = k in out ? deepMerge(out[k], v) : structuredClone(v);
    return out;
  }
  if (isIdList(base) && isIdList(patch)) {
    const out = structuredClone(base);
    for (const item of patch) {
      const i = out.findIndex((x) => x.id === item.id);
      if (i >= 0) out[i] = deepMerge(out[i], item);
      else out.push(structuredClone(item));
    }
    return out;
  }
  return structuredClone(patch);
}

export const MOCK_ORIGIN = 'https://cdn.example.com';

/**
 * A mock config scenario's body (mockserver/responses/config/<name>.json), with extends/body_patch
 * resolved like the mock and {{origin}} replaced by MOCK_ORIGIN (https, so the app accepts it).
 */
export function mockConfig(name = 'default') {
  const load = (n) => {
    const file = new URL(`../../mockserver/responses/config/${n}.json`, import.meta.url);
    const env = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!env.extends) return env.body;
    return deepMerge(load(env.extends), env.body_patch ?? {});
  };
  return JSON.parse(JSON.stringify(load(name)).replaceAll('{{origin}}', MOCK_ORIGIN));
}
