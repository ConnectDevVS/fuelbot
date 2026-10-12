import { afterEach, describe, expect, it } from 'vitest';
import { PLACEHOLDER, readEnvLabel } from './envLabel.js';

function setMeta(content) {
  document.head.querySelectorAll('meta[name="fb-env"]').forEach((m) => m.remove());
  if (content === undefined) return;
  const meta = document.createElement('meta');
  meta.setAttribute('name', 'fb-env');
  meta.setAttribute('content', content);
  document.head.append(meta);
}

describe('envLabel.js', () => {
  afterEach(() => setMeta(undefined));

  it('reads the label the server filled in', () => {
    setMeta('staging');
    expect(readEnvLabel(document)).toBe('staging');
  });

  it('none in production, on the dev server, or without the meta', () => {
    setMeta('');
    expect(readEnvLabel(document)).toBe('');
    setMeta(PLACEHOLDER);
    expect(readEnvLabel(document)).toBe('');
    setMeta(undefined);
    expect(readEnvLabel(document)).toBe('');
  });
});
