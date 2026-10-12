// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { hasString } from './strings.js';

const SRC = fileURLToPath(new URL('.', import.meta.url));

function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return sources(path);
    return /\.jsx?$/.test(e.name) && !/\.test\.jsx?$/.test(e.name) && e.name !== 'strings.js' ? [path] : [];
  });
}

/** Every literal key passed to t('…') or tn('…', …) in src/: a missing one renders as [key]. */
function literalKeys() {
  const found = [];
  for (const file of sources(SRC)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/\b(tn?)\(\s*'([^']+)'/g)) {
      found.push({ fn: m[1], key: m[2], file: relative(SRC, file) });
    }
  }
  return found;
}

describe('strings.js', () => {
  it('has every key the code passes to t() and tn()', () => {
    const keys = literalKeys();
    expect(keys.length).toBeGreaterThan(500);
    const missing = keys
      .filter(({ fn, key }) => !hasString(key) && !(fn === 'tn' && hasString(`${key}.one`)))
      .map(({ key, file }) => `${key} (${file})`);
    expect(missing).toEqual([]);
  });
});
