import { describe, expect, it } from 'vitest';
import { formatClock, formatDate, formatDateTime, relativeTime } from './time.js';

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
});
