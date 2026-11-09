// A complaint raised by a tenant user, answered by FuelBot staff (plan §4.15). Append-only: the
// thread (comments and status changes) lives in `events`; nothing is edited or deleted.
import mongoose from 'mongoose';
import { STRICT, SUB, TIMESTAMPS } from './common.js';

export const COMPLAINT_STATUSES = ['open', 'with_service', 'closed'];
export const MAX_EVENTS = 300;

const AuthorSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, default: '' },
  email: { type: String, required: true },
}, SUB);

const EventSchema = new mongoose.Schema({
  at: { type: Date, required: true },
  kind: { type: String, required: true, enum: ['comment', 'status'] },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, default: '' },
  email: { type: String, required: true },
  fuelbot: { type: Boolean, default: false },   // the author was FuelBot staff
  text: { type: String, required: true },
  from: { type: String, enum: COMPLAINT_STATUSES, default: undefined },   // status events only
  to: { type: String, enum: COMPLAINT_STATUSES, default: undefined },
}, { strict: true });

const ComplaintSchema = new mongoose.Schema({
  tenant_id: { type: String, required: true },
  number: { type: Number, required: true },   // per tenant, from Tenant.complaint_seq
  title: { type: String, required: true },
  description: { type: String, required: true },
  status: { type: String, required: true, enum: COMPLAINT_STATUSES, default: 'open' },
  created_by: { type: AuthorSchema, required: true },
  last_activity_at: { type: Date, required: true },
  events: { type: [EventSchema], default: [] },
}, { ...STRICT, timestamps: TIMESTAMPS, collection: 'complaints' });

ComplaintSchema.index({ tenant_id: 1, number: 1 }, { unique: true });
ComplaintSchema.index({ tenant_id: 1, last_activity_at: -1, _id: -1 });
ComplaintSchema.index({ 'created_by.user_id': 1, last_activity_at: -1, _id: -1 });
ComplaintSchema.index({ status: 1, last_activity_at: -1, _id: -1 });

export const Complaint = mongoose.model('Complaint', ComplaintSchema);
