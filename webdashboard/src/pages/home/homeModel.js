// Tenant Home (dashboard plan §5.3) as pure functions: the KPI sums over GET /fleet?tenant= (each
// machine's `today`), and the chart ranges per Day / Week / Month in the display zone.
import dayjs from '../../lib/dayjs.js';
import { localDateKey } from '../../lib/time.js';

/**
 * items: /fleet items (tenant or platform view). →
 * {revenue, count, avg (whole rupees, null at 0 orders), lastSaleAt, notDispensed, notDispensedAmount,
 *  online, total, outOfService}
 */
export function homeKpis(items = []) {
  const k = { revenue: 0, count: 0, avg: null, lastSaleAt: null, notDispensed: 0, notDispensedAmount: 0, online: 0, total: 0, outOfService: 0 };
  for (const m of items) {
    const today = m.today ?? {};
    k.revenue += today.revenue ?? 0;
    k.count += today.count ?? 0;
    k.notDispensed += today.not_dispensed ?? 0;
    k.notDispensedAmount += today.not_dispensed_amount ?? 0;
    if (today.last_sale_at && (!k.lastSaleAt || Date.parse(today.last_sale_at) > Date.parse(k.lastSaleAt))) k.lastSaleAt = today.last_sale_at;
    k.total += 1;
    if (m.online) k.online += 1;
    if (!m.in_service) k.outOfService += 1;
  }
  k.avg = k.count > 0 ? Math.round(k.revenue / k.count) : null;
  return k;
}

// Calendar arithmetic on 'YYYY-MM-DD' keys (never by adding hours, so DST can't shift a day).
const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const dateOf = (key) => new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10))));
const addDays = (key, n) => {
  const d = dateOf(key);
  d.setUTCDate(d.getUTCDate() + n);
  return keyOf(d);
};

/** A local date's midnight as an offset ISO string ('2026-09-15T00:00:00+05:30'). */
const startOf = (key, tz) => dayjs.tz(`${key}T00:00:00`, tz).format();

export const RANGE_SIZE = { day: 14, week: 12, month: 12 };

/**
 * The chart range ending today (inclusive): 14 days, 12 ISO weeks (from a Monday) or 12 months (from
 * the 1st). `from` inclusive, `to` = tomorrow 00:00 (exclusive), both in tz.
 */
export function homeRange(group, now, tz) {
  const today = localDateKey(now, tz);
  let first;
  if (group === 'week') {
    const dow = (dateOf(today).getUTCDay() + 6) % 7;   // Monday 0
    first = addDays(today, -dow - 7 * (RANGE_SIZE.week - 1));
  } else if (group === 'month') {
    const d = dateOf(today);
    first = keyOf(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - (RANGE_SIZE.month - 1), 1)));
  } else {
    first = addDays(today, -(RANGE_SIZE.day - 1));
  }
  return { from: startOf(first, tz), to: startOf(addDays(today, 1), tz), today };
}
