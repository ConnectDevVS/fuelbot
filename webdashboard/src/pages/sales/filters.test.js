import { describe, expect, it } from 'vitest';
import { activeCount, defaultGroup, parseFilters, rangeOf, summaryQuery, toSearch } from './filters.js';
import { bucketKeys } from '../../lib/time.js';

const TZ = 'Asia/Kolkata';
const NOW = Date.parse('2026-09-28T07:12:00Z');   // Mon 28 Sep 2026, 12:42 IST
const parse = (qs) => parseFilters(new URLSearchParams(qs));
const range = (qs, now = NOW) => rangeOf(parse(qs), now, TZ);

describe('filters', () => {
  it('presets produce IST day bounds', () => {
    expect(range('period=last_7_days')).toMatchObject({ from: '2026-09-22T00:00:00+05:30', to: '2026-09-29T00:00:00+05:30', days: 7 });
    expect(range('')).toMatchObject({ from: '2026-08-30T00:00:00+05:30', to: '2026-09-29T00:00:00+05:30', days: 30 });   // Last 30 days
    expect(range('period=today')).toMatchObject({ from: '2026-09-28T00:00:00+05:30', to: '2026-09-29T00:00:00+05:30', days: 1 });
    expect(range('period=yesterday')).toMatchObject({ from: '2026-09-27T00:00:00+05:30', to: '2026-09-28T00:00:00+05:30' });
    // 00:10 IST on the 29th is already the 29th (UTC still says the 28th).
    expect(range('period=today', Date.parse('2026-09-28T18:40:00Z')).from).toBe('2026-09-29T00:00:00+05:30');
    const weeks = range('period=last_12_weeks');
    expect(weeks.from).toBe('2026-07-13T00:00:00+05:30');   // a Monday
    expect(bucketKeys('week', weeks.from, weeks.to, TZ)).toHaveLength(12);
    const months = range('period=last_12_months');
    expect(months.from).toBe('2025-10-01T00:00:00+05:30');
    expect(bucketKeys('month', months.from, months.to, TZ)).toHaveLength(12);
  });

  it('This month / Last month', () => {
    expect(range('period=this_month')).toMatchObject({ from: '2026-09-01T00:00:00+05:30', to: '2026-09-29T00:00:00+05:30', days: 28 });
    expect(range('period=last_month')).toMatchObject({ from: '2026-08-01T00:00:00+05:30', to: '2026-09-01T00:00:00+05:30', days: 31 });
    // Across a year, and a short month.
    const jan = Date.parse('2027-01-05T06:00:00Z');
    expect(range('period=last_month', jan)).toMatchObject({ from: '2026-12-01T00:00:00+05:30', to: '2027-01-01T00:00:00+05:30' });
    expect(range('period=last_month', Date.parse('2026-03-10T06:00:00Z')).days).toBe(28);
  });

  it('custom end day is inclusive', () => {
    expect(range('period=custom&from=2026-09-01&to=2026-09-15'))
      .toMatchObject({ from: '2026-09-01T00:00:00+05:30', to: '2026-09-16T00:00:00+05:30', days: 15 });
    expect(range('period=custom&from=2026-09-10&to=2026-09-10').days).toBe(1);
    // Reversed dates are swapped; a missing or impossible date falls back to the default period.
    expect(parse('period=custom&from=2026-09-15&to=2026-09-01')).toMatchObject({ from: '2026-09-01', to: '2026-09-15' });
    expect(parse('period=custom&from=2026-02-30&to=2026-03-01')).toMatchObject({ period: 'last_30_days', from: null, to: null });
    expect(parse('period=custom&from=2026-09-01').period).toBe('last_30_days');
    // A DST zone keeps local midnights.
    const ny = rangeOf(parse('period=custom&from=2026-10-30&to=2026-11-02'), NOW, 'America/New_York');
    expect(ny).toMatchObject({ from: '2026-10-30T00:00:00-04:00', to: '2026-11-03T00:00:00-05:00', days: 4 });
  });

  it('URL round-trip', () => {
    const qs = 'view=not-dispensed&period=custom&from=2026-09-01&to=2026-09-15&group=week&tenant=powerfuel'
      + '&machine=E2E00002&flavor=guava&dispensed=false&result=timeout';
    expect(toSearch(parse(qs))).toBe(qs);
    expect(toSearch(parse(''))).toBe('');                               // defaults stay out of the URL
    expect(toSearch(parse('period=last_30_days&view=overview'))).toBe('');
    expect(toSearch(parse('period=today&view=not-dispensed'))).toBe('view=not-dispensed&period=today');   // Home's link
    expect(parse('period=nonsense&group=year&dispensed=maybe&result=HOMING&view=x'))
      .toMatchObject({ period: 'last_30_days', group: null, dispensed: null, result: null, view: 'overview' });
    expect(activeCount(parse(''))).toBe(0);
    expect(activeCount(parse('period=last_7_days&machine=DEV00001&dispensed=true'))).toBe(3);
  });

  it('default group by range length', () => {
    expect([1, 31].map(defaultGroup)).toEqual(['day', 'day']);
    expect([32, 182].map(defaultGroup)).toEqual(['week', 'week']);
    expect(defaultGroup(183)).toBe('month');
    expect(range('').group).toBe('day');
    expect(range('period=this_month').group).toBe('day');
    expect(range('period=last_12_weeks').group).toBe('week');
    expect(range('period=last_12_months').group).toBe('month');
    expect(range('period=last_12_months&group=day').group).toBe('day');   // chosen wins
  });

  it('summary query: same filters for every group; result only for staff', () => {
    const f = parse('machine=DEV00001&dispensed=false&result=timeout');
    const r = range('');
    const q = new URLSearchParams(summaryQuery('flavor', f, r, { tenant: 'powerfuel', staff: false }));
    expect(Object.fromEntries(q)).toEqual({ group: 'flavor', from: r.from, to: r.to, tenant: 'powerfuel', machine: 'DEV00001', dispensed: 'false' });
    expect(summaryQuery('day', f, r, { tenant: null, staff: true })).toContain('result=timeout');
  });
});
