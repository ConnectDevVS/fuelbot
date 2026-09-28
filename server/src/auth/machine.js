// Kiosk request identity (plan §3.1, §4.2): X-Tenant-Id + X-Machine-Id → req.kiosk.
// Then the machine key (plan §4.3), per MACHINE_AUTH: off | optional | required (default).
import { Machine, Tenant } from '../models/index.js';
import { HttpError } from '../errors.js';
import { findActiveKey, touchKey } from '../services/keys.js';

function header(req, name) {
  const value = req.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Sets req.kiosk = {tenantId, machineId, machine, known}. `known` = registered to that tenant.
 * Missing ids → 401 machine_unidentified (the app keeps and retries records on 401).
 * A known machine or its tenant disabled → 403.
 */
export async function identifyMachine(req, res, next) {
  const tenantId = header(req, 'X-Tenant-Id');
  const machineId = header(req, 'X-Machine-Id');
  if (!tenantId || !machineId) throw new HttpError(401, 'machine_unidentified');

  const machine = await Machine.findById(machineId).lean();
  const known = Boolean(machine && machine.tenant_id === tenantId);
  await checkKey(req, machineId, known);   // first: nothing about the machine leaks without its key
  if (known) {
    if (machine.disabled) throw new HttpError(403, 'machine_disabled');
    const tenant = await Tenant.findById(tenantId, { disabled: 1 }).lean();
    if (!tenant || tenant.disabled) throw new HttpError(403, 'tenant_disabled');
  }
  req.kiosk = { tenantId, machineId, machine: known ? machine : null, known };
  next();
}

// "Bearer <key>" → the key; anything else → ''.
function bearer(req) {
  const match = /^Bearer\s+(.+)$/i.exec(req.get('Authorization') ?? '');
  return match ? match[1].trim() : '';
}

/**
 * off: never checked. optional: a key that's sent must be right. required: a right key must be
 * sent. Refusals are 401 (the app keeps and retries the record). The key is never logged.
 */
async function checkKey(req, machineId, known) {
  const mode = req.app.locals.settings.machineAuth;
  if (mode === 'off') return;
  const key = bearer(req);
  if (!key) {
    if (mode === 'required') throw new HttpError(401, 'machine_key_required');
    return;
  }
  const doc = known ? await findActiveKey(machineId, key) : null;
  if (!doc) throw new HttpError(401, 'machine_key_invalid');
  touchKey(doc);
}

/** Best effort: records that the machine was seen. Never fails or delays the request. */
export function touchLastSeen(req) {
  if (!req.kiosk?.known) return;
  Machine.updateOne(
    { _id: req.kiosk.machineId, tenant_id: req.kiosk.tenantId },
    { $set: { last_seen_at: new Date(), last_seen_ip: req.ip ?? null } },
  ).catch((err) => console.warn(`[kiosk] last-seen update failed for ${req.kiosk.machineId}: ${err.message}`));
}
