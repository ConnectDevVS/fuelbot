import { afterEach, describe, expect, it } from 'vitest';
import { installNonce, PLACEHOLDER } from './nonce.js';

const original = Document.prototype.createElement;

function setMeta(content) {
  document.head.querySelectorAll('meta[name="csp-nonce"]').forEach((m) => m.remove());
  const meta = original.call(document, 'meta');
  meta.setAttribute('name', 'csp-nonce');
  meta.setAttribute('content', content);
  document.head.append(meta);
}

describe('nonce.js', () => {
  afterEach(() => {
    Document.prototype.createElement = original;
    document.head.querySelectorAll('meta[name="csp-nonce"]').forEach((m) => m.remove());
  });

  it('stamps the nonce on created styles', () => {
    setMeta('r4nd0mN0nce+/=');
    expect(installNonce(document)).toBe('r4nd0mN0nce+/=');
    expect(document.createElement('style').nonce).toBe('r4nd0mN0nce+/=');
    expect(document.createElement('STYLE').nonce).toBe('r4nd0mN0nce+/=');
    expect(document.createElement('div').nonce).toBe('');
  });

  it('does nothing with the placeholder', () => {
    setMeta(PLACEHOLDER);
    expect(installNonce(document)).toBeUndefined();
    expect(Document.prototype.createElement).toBe(original);
    expect(document.createElement('style').nonce).toBe('');
    document.head.querySelectorAll('meta[name="csp-nonce"]').forEach((m) => m.remove());
    expect(installNonce(document)).toBeUndefined();
  });
});
