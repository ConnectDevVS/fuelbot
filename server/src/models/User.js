// A dashboard user (plan §4.1, §4.7): FuelBot staff (platform_admin) or one tenant's user.
import mongoose from 'mongoose';
import { STRICT, TIMESTAMPS } from './common.js';

export const PLATFORM_ROLES = ['platform_admin'];
export const TENANT_ROLES = ['tenant_admin', 'operator', 'viewer'];
export const ROLES = [...PLATFORM_ROLES, ...TENANT_ROLES];

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, unique: true },
  name: { type: String, default: '' },
  password_hash: { type: String, required: true, select: false },
  role: { type: String, required: true, enum: ROLES },
  tenant_id: {
    type: String,
    default: undefined,
    required() { return TENANT_ROLES.includes(this.role); },
  },
  machines: { type: [String], default: [] },   // empty = all of the tenant's machines
  disabled: { type: Boolean, default: false },
  token_version: { type: Number, default: 0 },
  must_change_password: { type: Boolean, default: false },
  last_login_at: { type: Date, default: null },
}, { ...STRICT, timestamps: TIMESTAMPS, collection: 'users' });

UserSchema.index({ tenant_id: 1 });

UserSchema.pre('validate', function checkScope() {
  if (PLATFORM_ROLES.includes(this.role)) {
    this.tenant_id = undefined;
    this.machines = [];
  } else if (this.role === 'tenant_admin') {
    this.machines = [];   // a tenant_admin always has every machine
  }
});

export const User = mongoose.model('User', UserSchema);
