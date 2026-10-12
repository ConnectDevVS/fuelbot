// A refill or adjustment of one hopper (plan §4.13): the level after filling or measuring.
import mongoose from 'mongoose';
import { STRICT } from './common.js';

const StockEventSchema = new mongoose.Schema({
  tenant_id: { type: String, required: true },
  machine_id: { type: String, required: true },
  hopper: { type: Number, required: true },
  product_id: { type: String, required: true },
  kind: { type: String, required: true, enum: ['refill', 'adjust'] },
  level_g: { type: Number, required: true },
  note: { type: String, default: '' },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  user_email: String,
  at: { type: Date, required: true, default: () => new Date() },
}, { ...STRICT, collection: 'stock_events' });

StockEventSchema.index({ machine_id: 1, hopper: 1, at: -1 });
StockEventSchema.index({ tenant_id: 1, at: -1 });

export const StockEvent = mongoose.model('StockEvent', StockEventSchema);
