// One paid order, as SalesReporter sends it (plan §3.4, §4.1). Immutable.
import mongoose from 'mongoose';
import { STRICT } from './common.js';
import { RECORD_FIELDS } from './records.js';

const SaleSchema = new mongoose.Schema({
  order_id: { type: String, required: true, unique: true },
  order_number: Number,
  hopper: Number,
  actual_price: Number,
  offer_price: { type: Number, default: undefined },
  charged_price: Number,
  transaction_id: String,
  flavor_id: String,
  base_id: String,
  currency: String,
  payment_method: String,
  dispensing_result: String,
  dispensing_reason: String,
  ...RECORD_FIELDS,
}, { ...STRICT, collection: 'sales' });

SaleSchema.index({ tenant_id: 1, ts: -1 });
SaleSchema.index({ machine_id: 1, ts: -1 });

export const Sale = mongoose.model('Sale', SaleSchema);
