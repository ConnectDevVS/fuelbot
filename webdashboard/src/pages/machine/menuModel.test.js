// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { configErrorsByProduct, lowestFreeHopper, move, newRow, toPayload, toRows, warnings } from './menuModel.js';

const MENU = [
  { product_id: 'guava', hopper: 1, enabled: true, sold_out: false, badge: 'POPULAR', price: null, low_portions: 20 },
  { product_id: 'chocolate', hopper: 2, enabled: true, sold_out: false, badge: null, price: { actual_price: 190, offer_price: 170 }, low_portions: null },
  { product_id: 'coffee', hopper: 6, enabled: false, sold_out: true, badge: null, price: null, low_portions: 5 },
];

describe('menuModel', () => {
  it('toPayload keeps low_portions and order', () => {
    const rows = move(toRows(MENU), 2, 0);   // coffee first
    const payload = toPayload(rows);
    expect(payload.map((i) => i.product_id)).toEqual(['coffee', 'guava', 'chocolate']);
    expect(payload.map((i) => i.low_portions)).toEqual([5, 20, null]);
    expect(payload[1]).toEqual({ product_id: 'guava', hopper: 1, enabled: true, sold_out: false, badge: 'POPULAR', price: null, low_portions: 20 });
    expect(payload[2].price).toEqual({ actual_price: 190, offer_price: 170 });
    // Clearing an override sends null; a blank badge is null.
    const edited = toPayload([{ ...rows[2], override: false, badge: '  ' }]);
    expect(edited[0]).toMatchObject({ price: null, badge: null });
  });

  it('lowest free hopper', () => {
    expect(lowestFreeHopper([])).toBe(1);
    expect(lowestFreeHopper(toRows(MENU))).toBe(3);   // 1, 2 taken; 6 is disabled
    expect(lowestFreeHopper(toRows(MENU).map((r) => ({ ...r, enabled: false })))).toBe(1);
    const full = [1, 2, 3, 4, 5, 6].map((h) => ({ hopper: h, enabled: true }));
    expect(lowestFreeHopper(full)).toBe(1);
    expect(newRow('vanilla', toRows(MENU))).toEqual({ product_id: 'vanilla', hopper: 3, enabled: true, sold_out: false,
      badge: null, override: false, actual_price: null, offer_price: null, low_portions: null });
  });

  it('warns on duplicate enabled hopper but not on a disabled duplicate', () => {
    const rows = toRows(MENU);
    rows.push({ ...newRow('electro', rows), hopper: 1 });                  // enabled, hopper 1: guava has it
    rows.push({ ...newRow('vanilla', rows), hopper: 2, enabled: false });  // disabled: fine
    const w = warnings(rows);
    expect([...w.duplicates]).toEqual([[3, 0]]);
    expect(w.empty).toBe(false);
    expect(warnings([]).empty).toBe(true);
    expect(w.wiring).toEqual([]);   // coffee is on 6, but disabled
    expect(warnings([{ ...rows[0], hopper: 5 }]).wiring).toEqual([0]);
  });

  it('maps the app\'s 422 messages to products', () => {
    const err = { code: 'invalid_config', details: [
      { machine_id: 'DEV00001', errors: ['chocolate: hopper 1 already used by guava', 'no enabled flavor'] },
      { machine_id: 'OTHER001', errors: ['guava: something'] },
    ] };
    const map = configErrorsByProduct(err, 'DEV00001');
    expect(map.get('chocolate')).toEqual(['chocolate: hopper 1 already used by guava']);
    expect(map.get('')).toEqual(['no enabled flavor']);
    expect(map.has('guava')).toBe(false);
  });
});
