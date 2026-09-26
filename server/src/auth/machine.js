// Kiosk request identity (plan §3.1, §4.2): X-Tenant-Id + X-Machine-Id → req.kiosk.
// Machine keys come in S4; until then MACHINE_AUTH behaves like `off` (stories/kiosk-api decision 2).
import { Machine, Tenant } from '../models/index.js';
import { HttpError } from '../errors.js';

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
  if (known) {
    if (machine.disabled) throw new HttpError(403, 'machine_disabled');
    const tenant = await Tenant.findById(tenantId, { disabled: 1 }).lean();
    if (!tenant || tenant.disabled) throw new HttpError(403, 'tenant_disabled');
  }
  req.kiosk = { tenantId, machineId, machine: known ? machine : null, known };
  next();
}

/** Best effort: records that the machine was seen. Never fails or delays the request. */
export function touchLastSeen(req) {
  if (!req.kiosk?.known) return;
  Machine.updateOne(
    { _id: req.kiosk.machineId, tenant_id: req.kiosk.tenantId },
    { $set: { last_seen_at: new Date(), last_seen_ip: req.ip ?? null } },
  ).catch((err) => console.warn(`[kiosk] last-seen update failed for ${req.kiosk.machineId}: ${err.message}`));
}
