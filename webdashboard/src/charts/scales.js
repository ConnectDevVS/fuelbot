// Axis scales for the charts: "nice" ticks on 1-2-5 steps from 0, and ₹ tick labels (compact on
// phone: ₹1.2k).
import { formatMoney } from '../lib/money.js';

/** [0, step, …, top] with top ≥ max, as close to `count` intervals as 1/2/5 × 10^n steps allow. */
export function niceTicks(max, count = 4) {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  // The 1-2-5 step whose number of intervals is closest to `count`; on a tie, the one whose top
  // tick wastes the least space above the data.
  const step = [1, 2, 5, 10, 20].map((m) => m * power)
    .map((st) => {
      const n = Math.ceil(max / st - 1e-9);
      return { st, off: Math.abs(n - count), waste: n * st - max };
    })
    .sort((a, b) => a.off - b.off || a.waste - b.waste || b.st - a.st)[0].st;
  const ticks = [];
  for (let v = 0; v < max + step * 1e-9; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  if (ticks.at(-1) < max) ticks.push(Math.round((ticks.at(-1) + step) * 1e6) / 1e6);
  return ticks;
}

/** ₹ on the axis: full (₹1,200) or compact (₹1.2k, ₹12k, ₹1.2L never: kept simple for owners). */
export function formatAxisMoney(value, compact = false) {
  if (!compact || Math.abs(value) < 1000) return formatMoney(value);
  const k = value / 1000;
  return `₹${Number.isInteger(k) ? k : k.toFixed(k < 10 ? 1 : 0).replace(/\.0$/, '')}k`;
}

/** Up to `max` evenly spaced indexes from 0..n-1, always including the first and the last. */
export function thinIndexes(n, max) {
  if (n <= 0) return [];
  if (n <= max) return [...Array(n).keys()];
  if (max <= 1) return [0];
  const out = new Set();
  for (let i = 0; i < max; i += 1) out.add(Math.round((i * (n - 1)) / (max - 1)));
  return [...out];
}

/**
 * Indexes of x labels that can't collide: every `minStep`-th from the first, and the last (which
 * replaces the one before it when they'd be closer than minStep).
 */
export function labelIndexes(n, minStep) {
  if (n <= 0) return [];
  const step = Math.max(1, Math.ceil(minStep));
  const out = [];
  for (let i = 0; i < n; i += step) out.push(i);
  if (out.at(-1) !== n - 1) {
    if (n - 1 - out.at(-1) < step && out.length > 1) out.pop();
    out.push(n - 1);
  }
  return out;
}

/**
 * x labels that never touch: each label is centred on its column, clamped inside [min, max], and
 * kept only if it clears the previous kept one by `gap`; the last label always shows (it replaces
 * the one before it if they'd touch). centers: x of each column; widths: each label's width.
 * Returns [{i, x}] (x = the clamped centre).
 */
export function placeLabels(centers, widths, min, max, gap = 8) {
  const clamp = (x, w) => Math.min(Math.max(x, min + w / 2), max - w / 2);
  const kept = [];
  centers.forEach((c, i) => {
    const x = clamp(c, widths[i]);
    const prev = kept.at(-1);
    if (!prev || x - widths[i] / 2 >= prev.x + widths[prev.i] / 2 + gap) kept.push({ i, x });
  });
  const lastI = centers.length - 1;
  if (lastI >= 0 && kept.at(-1)?.i !== lastI) {
    const x = clamp(centers[lastI], widths[lastI]);
    while (kept.length && x - widths[lastI] / 2 < kept.at(-1).x + widths[kept.at(-1).i] / 2 + gap) kept.pop();
    kept.push({ i: lastI, x });
  }
  return kept;
}
