// Machine keys (plan §4.3, stories/machine-keys decision 1): typeable, shown once, stored hashed.
import crypto from 'node:crypto';
import { MachineKey } from '../models/index.js';

export const KEY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no 0 O 1 I L
export const KEY_LENGTH = 20;
export const DEV_KEY = 'DEVK-EYDE-VKEY-DEVK-EY01';   // the seed's key for DEV00001 (dev only)

/** Uppercase, dashes and whitespace removed: how a typed key is compared. */
export function normaliseKey(key) {
  return String(key ?? '').toUpperCase().replace(/[\s-]/g, '');
}

export function hashKey(key) {
  return crypto.createHash('sha256').update(normaliseKey(key)).digest('hex');
}

/** A new key, formatted XXXX-XXXX-XXXX-XXXX-XXXX. */
export function generateKey() {
  let raw = '';
  for (let i = 0; i < KEY_LENGTH; i += 1) raw += KEY_ALPHABET[crypto.randomInt(KEY_ALPHABET.length)];
  return raw.match(/.{4}/g).join('-');
}

/** Issues a key for a machine. Returns {key (plain, show once), doc}. */
export async function issueKey(machine, { label = '', createdBy = null, key = generateKey() } = {}) {
  const doc = await MachineKey.create({
    machine_id: machine._id,
    tenant_id: machine.tenant_id,
    hash: hashKey(key),
    prefix: normaliseKey(key).slice(0, 4),
    label,
    created_by: createdBy,
  });
  return { key, doc };
}

/** The active key matching `key` for that machine, or null. */
export async function findActiveKey(machineId, key) {
  if (!normaliseKey(key)) return null;
  return MachineKey.findOne({ hash: hashKey(key), machine_id: machineId, revoked_at: null }).lean();
}

/** Best effort, at most once a minute per key. */
export function touchKey(keyDoc) {
  const minuteAgo = new Date(Date.now() - 60 * 1000);
  if (keyDoc.last_used_at && keyDoc.last_used_at > minuteAgo) return;
  MachineKey.updateOne({ _id: keyDoc._id }, { $set: { last_used_at: new Date() } })
    .catch((err) => console.warn(`[keys] last-used update failed: ${err.message}`));
}

export function keyView(k) {
  return {
    id: String(k._id),
    prefix: k.prefix,
    label: k.label ?? '',
    created_at: k.created_at ?? null,
    created_by: k.created_by ? String(k.created_by) : null,
    last_used_at: k.last_used_at ?? null,
    revoked_at: k.revoked_at ?? null,
  };
}
