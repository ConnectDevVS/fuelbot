// @vitest-environment node
// Builds the app into a temporary folder and checks what the server will serve (SRV-29/30).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'vite';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FONTS = path.join(ROOT, 'src/styles/fonts');

describe('build', () => {
  let out;
  let html;

  beforeAll(async () => {
    out = fs.mkdtempSync(path.join(os.tmpdir(), 'fuelbot-dash-build-'));
    await build({ root: ROOT, logLevel: 'silent', build: { outDir: out, emptyOutDir: true } });
    html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  });
  afterAll(() => { fs.rmSync(out, { recursive: true, force: true }); });

  it('built index.html has no inline code and keeps the nonce placeholder', () => {
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
    expect(scripts.length).toBeGreaterThan(0);
    for (const [, attrs, body] of scripts) {
      expect(attrs).toMatch(/\ssrc="\/dashboard\//);
      expect(body.trim()).toBe('');
    }
    expect(html).not.toMatch(/<style\b/i);
    expect(html).not.toMatch(/\sstyle=/i);
    expect(html).not.toMatch(/\son[a-z]+=/i);
    for (const [, url] of html.matchAll(/\s(?:src|href)="([^"]+)"/g)) expect(url.startsWith('/dashboard/'), url).toBe(true);
    expect(html.match(/<meta name="csp-nonce" content="__CSP_NONCE__">/g)).toHaveLength(1);
    const assets = fs.readdirSync(path.join(out, 'assets'));
    expect(assets.some((f) => /^index-[\w-]+\.js$/.test(f))).toBe(true);
    expect(assets.some((f) => /\.woff2$/.test(f))).toBe(true);
  });

  it('fonts are subset WOFF2 under 120 KB each, OFL texts shipped', () => {
    for (const font of ['archivo.woff2', 'jetbrains-mono.woff2']) {
      const bytes = fs.readFileSync(path.join(FONTS, font));
      expect(bytes.subarray(0, 4).toString('latin1')).toBe('wOF2');
      expect(bytes.length).toBeLessThan(120 * 1024);
    }
    for (const text of ['OFL-Archivo.txt', 'OFL-JetBrainsMono.txt']) {
      expect(fs.readFileSync(path.join(FONTS, text), 'utf8')).toMatch(/SIL OPEN FONT LICENSE/i);
    }
  });
});
