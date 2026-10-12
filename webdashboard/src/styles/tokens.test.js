// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('..', import.meta.url));
const COLOUR_HOMES = ['theme/palette.js', 'styles/tokens.css'];

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : [full];
  }).filter((f) => /\.(css|jsx?|mjs)$/.test(f));
}

const rel = (f) => path.relative(SRC, f).split(path.sep).join('/');
// Test files may name colours to check them; everything else gets them from the palette.
const sources = files(SRC).filter((f) => !/\.test\.jsx?$/.test(f));

describe('tokens', () => {
  it('no colour literals outside palette.js/tokens.css', () => {
    const offenders = [];
    for (const f of sources) {
      if (COLOUR_HOMES.includes(rel(f))) continue;
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(/#[0-9A-Fa-f]{3,8}\b|\b(?:rgba?|hsla?)\(/g)) offenders.push(`${rel(f)}: ${m[0]}`);
    }
    expect(offenders).toEqual([]);
  });

  it('every var(--…) used in src/ is defined', () => {
    const defined = new Set();
    for (const f of sources.filter((x) => x.endsWith('.css'))) {
      for (const m of readFileSync(f, 'utf8').matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]);
    }
    const missing = [];
    for (const f of sources) {
      for (const m of readFileSync(f, 'utf8').matchAll(/var\(\s*(--[\w-]+)/g)) {
        if (!m[1].startsWith('--ant-') && !defined.has(m[1])) missing.push(`${rel(f)}: ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
    expect(defined.size).toBeGreaterThan(20);
  });
});
