import { describe, expect, it } from 'vitest';
import { formatAxisMoney, labelIndexes, niceTicks, placeLabels, thinIndexes } from './scales.js';

describe('scales', () => {
  it('nice ticks', () => {
    expect(niceTicks(1705)).toEqual([0, 500, 1000, 1500, 2000]);
    expect(niceTicks(2280)).toEqual([0, 500, 1000, 1500, 2000, 2500]);
    expect(niceTicks(95)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(niceTicks(100)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(niceTicks(50)).toEqual([0, 10, 20, 30, 40, 50]);
    expect(niceTicks(7)).toEqual([0, 2, 4, 6, 8]);
    expect(niceTicks(0)).toEqual([0, 1]);
    expect(niceTicks(123456)).toEqual([0, 50000, 100000, 150000]);
  });

  it('₹ axis labels and thinned x labels', () => {
    expect(formatAxisMoney(1500)).toBe('₹1,500');
    expect(formatAxisMoney(1500, true)).toBe('₹1.5k');
    expect(formatAxisMoney(2000, true)).toBe('₹2k');
    expect(formatAxisMoney(15000, true)).toBe('₹15k');
    expect(formatAxisMoney(500, true)).toBe('₹500');
    expect(thinIndexes(14, 5)).toEqual([0, 3, 7, 10, 13]);
    expect(thinIndexes(4, 6)).toEqual([0, 1, 2, 3]);
    expect(thinIndexes(12, 2)).toEqual([0, 11]);
    expect(labelIndexes(14, 2)).toEqual([0, 2, 4, 6, 8, 10, 13]);   // 12 would crowd 13: dropped
    expect(labelIndexes(14, 3)).toEqual([0, 3, 6, 9, 13]);
    expect(labelIndexes(12, 0.4)).toHaveLength(12);
    expect(labelIndexes(1, 5)).toEqual([0]);
  });

  it('x labels never touch, and the last one shows', () => {
    const centers = Array.from({ length: 14 }, (_, i) => 40 + 22 * i + 11);   // 22 px columns (a phone)
    const placed = placeLabels(centers, centers.map(() => 42), 40, 348);
    for (let k = 1; k < placed.length; k += 1) expect(placed[k].x - 21).toBeGreaterThanOrEqual(placed[k - 1].x + 21 + 8);
    expect(placed.at(-1).i).toBe(13);
    expect(placed[0].x).toBeGreaterThanOrEqual(40 + 21);   // clamped inside the plot
    expect(placed.at(-1).x).toBeLessThanOrEqual(348 - 21);
    expect(placeLabels([100, 200], [40, 40], 0, 400)).toEqual([{ i: 0, x: 100 }, { i: 1, x: 200 }]);
  });
});
