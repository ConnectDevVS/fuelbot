// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { palette } from './palette.js';
import { antdTheme } from './antdTheme.js';

const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const tokensCss = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
const cssVars = Object.fromEntries([...tokensCss.matchAll(/--fb-([\w-]+):\s*(#[0-9A-Fa-f]{3,8})\s*;/g)]
  .map(([, name, value]) => [name, value.toUpperCase()]));

/** WCAG 2 contrast ratio between two #RRGGBB colours. */
function contrast(a, b) {
  const lum = (hex) => {
    const [r, g, bl] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('theme', () => {
  it('antd theme and tokens.css use the same palette', () => {
    const fromPalette = Object.fromEntries(Object.entries(palette).map(([k, v]) => [kebab(k), v.toUpperCase()]));
    expect(cssVars).toEqual(fromPalette);
    // Every colour antd gets comes from the palette.
    const colours = new Set(Object.values(palette).map((v) => v.toUpperCase()));
    const walk = (obj) => Object.values(obj).flatMap((v) => (v && typeof v === 'object' ? walk(v) : [v]));
    const used = walk(antdTheme).filter((v) => typeof v === 'string' && v.startsWith('#'));
    expect(used.length).toBeGreaterThan(15);
    for (const c of used) expect(colours.has(c.toUpperCase()), c).toBe(true);
  });

  it('primary button is lime with dark text', () => {
    const button = antdTheme.components.Button;
    expect(button.colorPrimary).toBe('#C8FF3E');
    expect(button.primaryColor).toBe('#111215');
    expect(button.primaryShadow).toBe('none');
    expect(antdTheme.components.Segmented.itemSelectedBg).toBe('#C8FF3E');
    expect(antdTheme.components.Segmented.itemSelectedColor).toBe('#111215');
    expect(contrast(button.colorPrimary, button.primaryColor)).toBeGreaterThan(12);
  });

  it('colorPrimary is readable on white', () => {
    expect(contrast(antdTheme.token.colorPrimary, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(antdTheme.token.colorLink, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette.muted, palette.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette.accent, '#FFFFFF')).toBeLessThan(2);   // why the lime is never text on white
  });
});
