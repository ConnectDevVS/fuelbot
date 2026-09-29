// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { TEMP_ALPHABET, tempPassword } from './tempPassword.js';

describe('tempPassword', () => {
  it('14 chars, no look-alikes, ≥ 10 so the server accepts it', () => {
    for (let i = 0; i < 200; i += 1) {
      const p = tempPassword();
      expect(p).toHaveLength(14);
      expect(p.length).toBeGreaterThanOrEqual(10);   // the server's rule
      expect(p).not.toMatch(/[01OoIlL]/);
      for (const c of p) expect(TEMP_ALPHABET).toContain(c);
    }
    expect(TEMP_ALPHABET).not.toMatch(/[01OoIlL]/);
    // Not the same twice (random, from getRandomValues).
    expect(new Set(Array.from({ length: 50 }, () => tempPassword())).size).toBe(50);
  });
});
