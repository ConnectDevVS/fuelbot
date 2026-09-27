// A machine: belongs to one tenant; its own menu, bases, maintenance and health (plan §4.1).
import mongoose from 'mongoose';
import { STRICT, SUB, TIMESTAMPS } from './common.js';

const PriceSchema = new mongoose.Schema({
  actual_price: { type: Number, required: true },
  offer_price: { type: Number, default: null },
}, SUB);

const MenuItemSchema = new mongoose.Schema({
  product_id: { type: String, required: true },
  hopper: { type: Number, required: true },
  enabled: { type: Boolean, default: true },
  sold_out: { type: Boolean, default: false },
  badge: { type: String, default: null },
  price: { type: PriceSchema, default: undefined },
  low_portions: Number,                    // low-stock threshold for this hopper (plan §4.13)
}, SUB);

const BaseSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  code: { type: String, required: true },
  enabled: { type: Boolean, default: true },
}, SUB);

const FaultSchema = new mongoose.Schema({
  code: String,
  description: String,
}, SUB);

const MaintenanceSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  message: { type: String, default: '' },
  flagged_by: { type: String, default: null },
  flagged_at: { type: Date, default: null },
  faults: { type: [FaultSchema], default: [] },
}, SUB);

const HealthSchema = new mongoose.Schema({
  faults: { type: Map, of: Date, default: () => new Map() },
  last_event_at: { type: Date, default: null },
}, SUB);

const MachineSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  tenant_id: { type: String, required: true, index: true },
  name: String,
  location_label: String,
  site: String,
  support_phone: String,
  menu: { type: [MenuItemSchema], default: [] },
  bases: { type: [BaseSchema], default: [] },
  maintenance: { type: MaintenanceSchema, default: () => ({}) },
  idle_video_url: { type: String, default: null },
  menu_version: { type: Number, default: 0 },
  disabled: { type: Boolean, default: false },
  health: { type: HealthSchema, default: () => ({}) },
  last_seen_at: { type: Date, default: null },
  last_seen_ip: { type: String, default: null },
}, { ...STRICT, timestamps: TIMESTAMPS, collection: 'machines' });

MachineSchema.index({ tenant_id: 1, 'menu.product_id': 1 });

// Backstop (plan §4.1): no code path saves a machine whose config the app would reject.
// Loaded lazily: services/catalog.js imports the models.
const CONFIG_PATHS = ['menu', 'bases', 'maintenance', 'location_label', 'site', 'support_phone',
  'idle_video_url', 'tenant_id'];
MachineSchema.pre('validate', async function checkConfig() {
  if (!this.isNew && !CONFIG_PATHS.some((path) => this.isModified(path))) return;
  // Not configured yet (registered, menu never filled): nothing to validate. Emptying a menu
  // that had items is validated, and refused (the app needs at least one flavor).
  if (this.menu.length === 0 && (this.isNew || !this.isModified('menu'))) return;
  const { assertMachineValid } = await import('../services/catalog.js');
  await assertMachineValid(this);
});

export const Machine = mongoose.model('Machine', MachineSchema);
