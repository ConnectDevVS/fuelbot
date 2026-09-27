// A machine's key (plan §4.1, §4.3): only the SHA-256 of the normalised key is stored.
import mongoose from 'mongoose';
import { STRICT, TIMESTAMPS } from './common.js';

const MachineKeySchema = new mongoose.Schema({
  machine_id: { type: String, required: true, index: true },
  tenant_id: { type: String, required: true, index: true },
  hash: { type: String, required: true, unique: true },
  prefix: { type: String, required: true },
  label: { type: String, default: '' },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  last_used_at: { type: Date, default: null },
  revoked_at: { type: Date, default: null },
}, { ...STRICT, timestamps: TIMESTAMPS, collection: 'machine_keys' });

export const MachineKey = mongoose.model('MachineKey', MachineKeySchema);
