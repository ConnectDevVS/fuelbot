// Fields shared by Sale and TelemetryEvent: identity, time and the extra bucket (plan §4.1).
import mongoose from 'mongoose';

export const RECORD_FIELDS = {
  timestamp: String,                       // the client's value, as sent
  tenant_id: { type: String, required: true },
  machine_id: { type: String, required: true },
  body_tenant_id: String,                  // only when the body's differs from the header
  body_machine_id: String,
  ts: { type: Date, required: true },      // parsed timestamp, or received_at
  received_at: { type: Date, required: true },
  machine_known: { type: Boolean, required: true },
  extra: { type: mongoose.Schema.Types.Mixed, default: undefined },  // unknown or wrong-typed fields
};

/** Fields the ingest handler sets itself; a body value for them goes to extra. */
export const SERVER_FIELDS = ['tenant_id', 'machine_id', 'body_tenant_id', 'body_machine_id', 'ts',
  'received_at', 'machine_known', 'extra', '_id', '__v'];
