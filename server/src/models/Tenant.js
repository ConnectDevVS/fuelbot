// A company. Owns products and machines (plan §4.1).
import mongoose from 'mongoose';
import { STRICT, SUB, TIMESTAMPS } from './common.js';

const BrandingSchema = new mongoose.Schema({
  display_name: String,
  logo_text: String,
  support_phone: String,
}, SUB);

const TenantSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  name: { type: String, required: true },
  branding: { type: BrandingSchema, default: () => ({}) },
  catalog_version: { type: Number, default: 0 },
  disabled: { type: Boolean, default: false },
}, { ...STRICT, timestamps: TIMESTAMPS, collection: 'tenants' });

export const Tenant = mongoose.model('Tenant', TenantSchema);
