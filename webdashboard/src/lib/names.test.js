import { describe, expect, it } from 'vitest';
import { machineName, nameOf } from './names.js';

describe('names', () => {
  it('machineName falls back to location label, then id', () => {
    expect(machineName({ id: 'DEV00001', name: 'Bay 02', location_label: 'FUELBOT · BAY 02' })).toBe('Bay 02');
    expect(machineName({ id: 'DEV00001', name: '', location_label: 'FUELBOT · BAY 02' })).toBe('FUELBOT · BAY 02');
    expect(machineName({ id: 'DEV00001', name: '  ', location_label: null })).toBe('DEV00001');
    expect(nameOf(new Map([['guava', 'Prymor Guava']]), 'guava')).toBe('Prymor Guava');
    expect(nameOf(new Map(), 'retired')).toBe('retired');
  });
});
