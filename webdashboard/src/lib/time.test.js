import { describe, expect, it } from 'vitest';
import { bucketAxisLabel, bucketKeys, bucketLabel, formatClock, formatDate, formatDateTime, formatDuration, relativeTime } from './time.js';

const TZ = 'Asia/Kolkata';

describe('time', () => {
  it('formats in Asia/Kolkata', () => {
    expect(formatClock('2026-09-28T07:12:02Z', TZ)).toBe('12:42 IST');
    expect(formatDateTime('2026-09-28T07:12:02Z', TZ)).toBe('28 Sep 2026, 12:42 IST');
    expect(formatDate('2026-09-27T18:30:00Z', TZ)).toBe('28 Sep 2026');   // midnight IST: already the 28th
    expect(formatDateTime('2026-09-28T07:12:02Z', 'Europe/London')).toBe('28 Sep 2026, 08:12');
  });

  it('relativeTime thresholds', () => {
    const now = Date.parse('2026-09-28T07:12:02Z');
    const ago = (s) => new Date(now - s * 1000).toISOString();
    expect(relativeTime(ago(0), now, TZ)).toBe('just now');
    expect(relativeTime(ago(59), now, TZ)).toBe('just now');
    expect(relativeTime(ago(60), now, TZ)).toBe('1 min ago');
    expect(relativeTime(ago(59 * 60 + 59), now, TZ)).toBe('59 min ago');
    expect(relativeTime(ago(3600), now, TZ)).toBe('1 h ago');
    expect(relativeTime(ago(86399), now, TZ)).toBe('23 h ago');
    expect(relativeTime(ago(86400), now, TZ)).toBe('27 Sep, 12:42');
    expect(relativeTime(new Date(now + 5000).toISOString(), now, TZ)).toBe('just now');   // clock skew
  });

  it('null → never', () => {
    expect(relativeTime(null)).toBe('never');
    expect(relativeTime(undefined)).toBe('never');
    expect(formatDateTime(null, TZ)).toBe('—');
  });

  it('bucket keys match the server', () => {
    // 28 Dec 2026 → 10 Jan 2027 in IST ([from, to) as ISO instants, like the pages send).
    const from = '2026-12-27T18:30:00Z';
    const to = '2027-01-10T18:30:00Z';
    const days = bucketKeys('day', from, to, TZ);
    expect(days).toHaveLength(14);
    expect([days[0], days.at(-1)]).toEqual(['2026-12-28', '2027-01-10']);
    // The server's %G-W%V (SRV-27, MongoDB): 1 Jan 2027 is 2026-W53, 4 Jan 2027 is 2027-W01.
    expect(bucketKeys('week', from, to, TZ)).toEqual(['2026-W53', '2027-W01']);
    expect(bucketKeys('month', from, to, TZ)).toEqual(['2026-12', '2027-01']);
    expect(bucketKeys('week', '2025-12-28T18:30:00Z', '2025-12-29T18:30:00Z', TZ)).toEqual(['2026-W01']);   // 29 Dec 2025
    // Sun 27 Sep 23:59 IST is W39, Mon 00:00 W40 (the SRV-27 edge).
    expect(bucketKeys('week', '2026-09-27T18:29:59Z', '2026-09-27T18:30:01Z', TZ)).toEqual(['2026-W39', '2026-W40']);
    // A DST zone: London's clocks go back on Sunday 25 Oct 2026 (a 25 h day).
    const london = bucketKeys('day', '2026-10-23T23:00:00Z', '2026-10-27T00:00:00Z', 'Europe/London');
    expect(london).toEqual(['2026-10-24', '2026-10-25', '2026-10-26']);
    // And forward on 29 Mar 2026 (a 23 h day).
    expect(bucketKeys('day', '2026-03-28T00:00:00Z', '2026-03-30T23:00:00Z', 'Europe/London'))
      .toEqual(['2026-03-28', '2026-03-29', '2026-03-30']);
  });

  it('bucket labels', () => {
    expect(bucketLabel('2026-09-28', 'day')).toBe('28 Sep');
    expect(bucketLabel('2026-W39', 'week')).toBe('Week 39 · 21–27 Sep');
    expect(bucketLabel('2026-W53', 'week')).toBe('Week 53 · 28 Dec – 3 Jan');
    expect(bucketLabel('2026-09', 'month')).toBe('Sep 2026');
    expect([bucketAxisLabel('2026-09-28', 'day'), bucketAxisLabel('2026-W09', 'week'), bucketAxisLabel('2026-10', 'month')])
      .toEqual(['28 Sep', 'W9', 'Oct']);
  });

  it('formats durations', () => {
    expect([null, 42, 250, 900, 11100, 180000].map(formatDuration)).toEqual(['—', '42 s', '4 min 10 s', '15 min 0 s', '3 h 5 min', '2 d 2 h']);
  });
});
