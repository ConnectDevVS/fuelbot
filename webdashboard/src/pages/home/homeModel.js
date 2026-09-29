// Tenant Home (dashboard plan §5.3) as pure functions: the KPI sums over GET /fleet?tenant= (each
// machine's `today`), and the chart ranges per Day / Week / Month in the display zone.
import { addDaysKey, localDateKey, localMidnightIso, mondayKey, monthStartKey } from '../../lib/time.js';

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

export const RANGE_SIZE = { day: 14, week: 12, month: 12 };

/**
 * The chart range ending today (inclusive): 14 days, 12 ISO weeks (from a Monday) or 12 months (from
 * the 1st). `from` inclusive, `to` = tomorrow 00:00 (exclusive), both in tz.
 */
export function homeRange(group, now, tz) {
  const today = localDateKey(now, tz);
  let first = addDaysKey(today, -(RANGE_SIZE.day - 1));
  if (group === 'week') first = addDaysKey(mondayKey(today), -7 * (RANGE_SIZE.week - 1));
  if (group === 'month') first = monthStartKey(today, -(RANGE_SIZE.month - 1));
  return { from: localMidnightIso(first, tz), to: localMidnightIso(addDaysKey(today, 1), tz), today };
}
