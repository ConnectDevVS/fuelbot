// One telemetry event, as TelemetryReporter sends it (plan §3.3, §4.1). Immutable.
import mongoose from 'mongoose';
import { STRICT } from './common.js';
import { RECORD_FIELDS } from './records.js';

const StageSchema = new mongoose.Schema({
  stage: String,
  t_offset_ms: Number,
}, { _id: false, strict: true });

const TelemetryEventSchema = new mongoose.Schema({
  event_id: { type: String, required: true, unique: true },
  event_type: { type: String, required: true },
  v: Number,
  source: String,
  order_id: String,
  transaction_id: String,
  flavor_id: String,
  base_id: String,
  base: String,
  result: String,
  reason: String,
  fault: { type: String, default: undefined },
  cleared: String,
  file_name: String,
  order_number: Number,
  hopper: Number,
  duration_ms: Number,
  silent_sec: Number,
  down_sec: Number,
  stages: { type: [StageSchema], default: undefined },
  ...RECORD_FIELDS,
}, { ...STRICT, collection: 'telemetry' });

TelemetryEventSchema.index({ tenant_id: 1, ts: -1 });
TelemetryEventSchema.index({ machine_id: 1, ts: -1 });
TelemetryEventSchema.index({ event_type: 1, ts: -1 });

export const TelemetryEvent = mongoose.model('TelemetryEvent', TelemetryEventSchema);
