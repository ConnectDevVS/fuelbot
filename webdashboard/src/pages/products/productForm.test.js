// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { bundledName, toBody, toForm } from './productForm.js';

// As captured: GET /tenants/powerfuel/products/guava (the e2e seed).
const GUAVA = {
  id: 'guava', name: 'Prymor Guava', description: 'Cold-blended whey isolate with real guava and electrolytes.', volume_ml: 400,
  nutrition: { kcal: 210, protein_g: 24, carbs_g: 12, fat_g: 2 },
  ingredients: ['Whey protein isolate', 'Guava pulp'], allergens: ['Milk', 'Soy'],
  image_url: null, image: 'res://assets/images/flavors/prymor_guava.png',
  actual_price: 90, offer_price: 75, portion_g: 32.5, archived: false, rev: 3, machines: ['DEV00001', 'E2E00002'],
  updated_at: '2026-09-28T07:00:00.000Z',
};

describe('productForm', () => {
  it('round-trips a captured product', () => {
    const body = toBody(toForm(GUAVA));
    expect(body).toEqual({
      name: 'Prymor Guava', description: GUAVA.description, volume_ml: 400, nutrition: GUAVA.nutrition,
      ingredients: GUAVA.ingredients, allergens: GUAVA.allergens, image: GUAVA.image,
      actual_price: 90, offer_price: 75, portion_g: 32.5,
    });
    expect(body).not.toHaveProperty('image_url');
    expect(body).not.toHaveProperty('product_id');
    expect(toBody(toForm(GUAVA), { create: true }).product_id).toBe('guava');
  });

  it('empty optional fields become null', () => {
    const v = { ...toForm(GUAVA), description: '   ', volume_ml: null, image: '', offer_price: null, portion_g: '',
      nutrition: { kcal: null, protein_g: null, carbs_g: null, fat_g: null }, ingredients: [' Whey ', '', '  '], allergens: [] };
    expect(toBody(v)).toMatchObject({ description: null, volume_ml: null, image: null, offer_price: null, portion_g: null,
      nutrition: null, ingredients: ['Whey'], allergens: [] });
    // Partial nutrition: only what was entered (each key is optional on the server).
    expect(toBody({ ...v, nutrition: { kcal: 180, protein_g: null } }).nutrition).toEqual({ kcal: 180 });
    expect(toForm({ id: 'x', name: 'X', actual_price: 50 })).toMatchObject({ description: '', image: '', ingredients: [], offer_price: null });
  });

  it('numbers stay numbers', () => {
    const body = toBody({ ...toForm(GUAVA), actual_price: 95, portion_g: '31.5', volume_ml: '350', nutrition: { kcal: '200', fat_g: 0 } });
    expect(body.actual_price).toBe(95);
    expect(body.portion_g).toBe(31.5);
    expect(body.volume_ml).toBe(350);
    expect(body.nutrition).toEqual({ kcal: 200, fat_g: 0 });
    expect(bundledName(GUAVA.image)).toBe('prymor_guava.png');
  });
});
