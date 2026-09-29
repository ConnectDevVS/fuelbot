import { describe, expect, it } from 'vitest';
import { homeKpis, homeRange } from './homeModel.js';
import { bucketKeys } from '../../lib/time.js';

const today = (count, revenue, nd = 0, ndAmount = 0, last = null) => ({ count, revenue, not_dispensed: nd, not_dispensed_amount: ndAmount, last_sale_at: last });

describe('homeKpis', () => {
  it("sums today across machines; average rounds to whole rupees; out-of-service count", () => {
    const k = homeKpis([
      { id: 'A', online: true, in_service: false, today: today(18, 1705, 1, 95, '2026-09-28T07:01:00.000Z') },
      { id: 'B', online: true, in_service: true, today: today(6, 575, 0, 0, '2026-09-28T06:40:00.000Z') },
      { id: 'C', online: false, in_service: false, today: today(0, 0) },
      { id: 'D', online: false, in_service: true },   // no `today` at all
    ]);
    expect(k).toMatchObject({ revenue: 2280, count: 24, notDispensed: 1, notDispensedAmount: 95, online: 2, total: 4, outOfService: 2 });
    expect(k.avg).toBe(95);   // 2280 / 24
    expect(k.lastSaleAt).toBe('2026-09-28T07:01:00.000Z');
    expect(homeKpis([{ online: true, in_service: true, today: today(3, 250) }]).avg).toBe(83);   // 83.33
    expect(homeKpis([{ online: true, in_service: true, today: today(2, 185) }]).avg).toBe(93);   // 92.5 → 93
    expect(homeKpis([])).toMatchObject({ revenue: 0, count: 0, avg: null, lastSaleAt: null, total: 0, outOfService: 0 });
  });
});

describe('homeRange', () => {
  const now = Date.parse('2026-09-28T07:12:00Z');   // Mon 28 Sep 2026, 12:42 IST
  const tz = 'Asia/Kolkata';

  it('14 days / 12 weeks / 12 months ending today, as IST day bounds', () => {
    expect(homeRange('day', now, tz)).toEqual({ from: '2026-09-15T00:00:00+05:30', to: '2026-09-29T00:00:00+05:30', today: '2026-09-28' });
    expect(homeRange('week', now, tz).from).toBe('2026-07-13T00:00:00+05:30');   // Monday of W29
    expect(homeRange('month', now, tz).from).toBe('2025-10-01T00:00:00+05:30');
    for (const [group, n] of [['day', 14], ['week', 12], ['month', 12]]) {
      const { from, to } = homeRange(group, now, tz);
      expect(bucketKeys(group, from, to, tz), group).toHaveLength(n);
    }
  });

  it('uses the local date: 23:59 IST is still that day', () => {
    const late = Date.parse('2026-09-27T18:29:00Z');   // Sun 27 Sep, 23:59 IST
    expect(homeRange('day', late, tz).to).toBe('2026-09-28T00:00:00+05:30');
    expect(homeRange('week', late, tz).from).toBe('2026-07-06T00:00:00+05:30');   // Sunday belongs to W39
  });

  it('months cross a year; a DST zone keeps local midnights', () => {
    expect(homeRange('month', Date.parse('2027-01-10T12:00:00Z'), tz).from).toBe('2026-02-01T00:00:00+05:30');
    const r = homeRange('day', Date.parse('2026-11-02T12:00:00Z'), 'America/New_York');   // DST ended 1 Nov
    expect(r.from).toBe('2026-10-20T00:00:00-04:00');
    expect(r.to).toBe('2026-11-03T00:00:00-05:00');
    expect(bucketKeys('day', r.from, r.to, 'America/New_York')).toHaveLength(14);
  });
});
