import { describe, expect, it } from 'vitest';
import { registerForm, snapshotForms, takeForm } from './pendingForm.js';

describe('pendingForm', () => {
  it('keeps a mounted form once, without secrets', () => {
    const off = registerForm('/dashboard/t/p/products', () => ({ name: 'Guava', password: 'x', machine_key: 'K' }));
    snapshotForms();
    off();
    expect(takeForm('/dashboard/t/p/products')).toEqual({ name: 'Guava' });
    expect(takeForm('/dashboard/t/p/products')).toBeUndefined();
  });
});
