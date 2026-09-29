// A telemetry event's own fields as one line (the common ones left out): order page, telemetry lists.
// Fields every event has; the rest of an event is its details.
const COMMON = new Set(['id', 'event_id', 'event_type', 'tenant_id', 'machine_id', 'order_id', 'ts', 'received_at', 'machine_known',
  'source', 'v', 'timestamp', 'body_tenant_id', 'body_machine_id', 'stages']);

export function eventDetails(e) {
  return Object.entries(e).filter(([k, v]) => !COMMON.has(k) && v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ');
}
