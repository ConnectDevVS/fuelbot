// Shared by the scripts: --key=value arguments, a database session, config files.
import fs from 'node:fs';
import { loadSettings } from '../src/settings.js';
import { connectDb, disconnectDb } from '../src/db.js';
import { CatalogError } from '../src/errors.js';

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {};
  const positional = [];
  for (const arg of argv) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (match) options[match[1]] = match[2] ?? true;
    else positional.push(arg);
  }
  return { options, positional };
}

/** Runs fn with the database connected; prints catalog errors readably; sets the exit code. */
export async function withDb(fn) {
  const settings = loadSettings();
  await connectDb(settings.mongoUrl);
  try {
    await fn(settings);
  } catch (err) {
    if (err instanceof CatalogError) {
      console.error('Refused: the app would reject this config.');
      for (const { machine_id: id, errors } of err.details) {
        for (const e of errors) console.error(`  ${id}: ${e}`);
      }
    } else {
      console.error(err.message);
    }
    process.exitCode = 1;
  } finally {
    await disconnectDb();
  }
}

/** An app config body from a file: a plain config, or a mock scenario envelope ({status, body}). */
export function readConfigFile(file) {
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (json && typeof json === 'object' && 'extends' in json) {
    throw new Error(`${file} uses "extends"; import a resolved config instead`);
  }
  return json && typeof json === 'object' && 'body' in json && 'status' in json ? json.body : json;
}

/** Removes image_url from every flavor (their bundled `image` stays as the picture). */
export function stripImageUrls(config) {
  for (const f of config.flavors ?? []) delete f.image_url;
  return config;
}
