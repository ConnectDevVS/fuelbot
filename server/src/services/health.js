// Machine health from telemetry (plan §4.5): active fault codes, applied in client-time order.
import { Machine } from '../models/index.js';

export const BRIDGE_DOWN = 'BRIDGE_DOWN';
export const HEALTH_EVENTS = ['machine_fault', 'machine_ok', 'bridge_down', 'bridge_up'];

// Map keys become Mongo paths: nothing that could break a path (dots, $).
const SAFE_CODE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Applies a stored telemetry record to its machine's health. An event older than the newest
 * applied one changes nothing (it's still stored). Unknown machines have no health.
 */
export async function applyHealthEvent(record) {
  if (!record.machine_known || !HEALTH_EVENTS.includes(record.event_type)) return false;
  const ts = record.ts;
  const set = {};
  const unset = {};
  const min = {};
  switch (record.event_type) {
    case 'machine_fault':
      if (!SAFE_CODE.test(record.fault ?? '')) return false;
      min[`health.faults.${record.fault}`] = ts;
      break;
    case 'bridge_down':
      min[`health.faults.${BRIDGE_DOWN}`] = ts;
      break;
    case 'bridge_up':
      unset[`health.faults.${BRIDGE_DOWN}`] = '';
      break;
    case 'machine_ok': {
      if (SAFE_CODE.test(record.cleared ?? '')) {
        unset[`health.faults.${record.cleared}`] = '';
      } else {
        // No code: the board is healthy again, so every board fault clears (BRIDGE_DOWN is the app's).
        const machine = await Machine.findById(record.machine_id, { health: 1 }).lean();
        for (const code of Object.keys(machine?.health?.faults ?? {})) {
          if (code !== BRIDGE_DOWN) unset[`health.faults.${code}`] = '';
        }
      }
      break;
    }
    default:
      return false;
  }
  set['health.last_event_at'] = ts;
  const update = { $set: set };
  if (Object.keys(unset).length) update.$unset = unset;
  if (Object.keys(min).length) update.$min = min;
  // The raw collection: Mongoose doesn't reliably cast $min/$unset on Map sub-paths. Every path
  // here is a schema path (health.faults.<code>, health.last_event_at), so nothing escapes the schema.
  const result = await Machine.collection.updateOne(
    {
      _id: record.machine_id,
      tenant_id: record.tenant_id,
      $or: [{ 'health.last_event_at': null }, { 'health.last_event_at': { $lte: ts } }],
    },
    update,
  );
  return result.modifiedCount === 1;
}
