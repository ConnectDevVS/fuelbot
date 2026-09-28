import { describe, expect, it } from 'vitest';
import { formatCount, formatMoney } from './money.js';

describe('money', () => {
  it('₹1,23,456 grouping; no decimals; null → —', () => {
    expect(formatMoney(123456)).toBe('₹1,23,456');
    expect(formatMoney(75)).toBe('₹75');
    expect(formatMoney(0)).toBe('₹0');
    expect(formatMoney(1705.6)).toBe('₹1,706');
    expect(formatMoney(12345678)).toBe('₹1,23,45,678');
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney(undefined)).toBe('—');
    expect(formatCount(1234)).toBe('1,234');
  });
});
