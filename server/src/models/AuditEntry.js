// Who changed what, when (plan §4.1). Platform-only to read (§4.7). Never holds a password.
import mongoose from 'mongoose';
import { STRICT } from './common.js';

const AuditEntrySchema = new mongoose.Schema({
  at: { type: Date, required: true, default: () => new Date() },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  user_email: String,
  action: { type: String, required: true },
  tenant_id: String,
  machine_id: String,
  target: String,
  ip: String,
  before: { type: mongoose.Schema.Types.Mixed, default: undefined },
  after: { type: mongoose.Schema.Types.Mixed, default: undefined },
}, { ...STRICT, collection: 'audit' });

AuditEntrySchema.index({ at: -1 });
AuditEntrySchema.index({ tenant_id: 1, at: -1 });
AuditEntrySchema.index({ user_id: 1, at: -1 });
AuditEntrySchema.index({ action: 1, at: -1 });

export const AuditEntry = mongoose.model('AuditEntry', AuditEntrySchema);
