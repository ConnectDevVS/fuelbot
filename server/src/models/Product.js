// A tenant's product: what a flavor looks like on every machine that sells it (plan §4.1).
import mongoose from 'mongoose';
import { STRICT, SUB, TIMESTAMPS } from './common.js';

const NutritionSchema = new mongoose.Schema({
  kcal: Number,
  protein_g: Number,
  carbs_g: Number,
  fat_g: Number,
}, SUB);

const ProductSchema = new mongoose.Schema({
  tenant_id: { type: String, required: true },
  product_id: { type: String, required: true },
  name: { type: String, required: true },
  description: String,
  volume_ml: Number,
  nutrition: { type: NutritionSchema, default: undefined },
  ingredients: { type: [String], default: undefined },
  allergens: { type: [String], default: undefined },
  image_url: String,
  image: String,
  actual_price: { type: Number, required: true },
  offer_price: { type: Number, default: null },
  portion_g: Number,                       // grams per serving (plan §4.13)
  archived: { type: Boolean, default: false },
  rev: { type: Number, default: 0 },
}, { ...STRICT, timestamps: TIMESTAMPS, collection: 'products' });

ProductSchema.index({ tenant_id: 1, product_id: 1 }, { unique: true });

// Backstop (plan §4.1): a product change must not break any machine whose menu uses it.
ProductSchema.pre('validate', async function checkMachines() {
  if (this.isNew) return;   // not on any menu yet
  const { assertProductValid } = await import('../services/catalog.js');
  await assertProductValid(this);
});

export const Product = mongoose.model('Product', ProductSchema);
