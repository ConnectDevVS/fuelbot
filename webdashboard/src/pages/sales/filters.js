// Sales filters (dashboard plan §5.7; SRV-39) ⇄ the URL query, and the ranges they mean in the
// display zone. The URL holds what the user chose (defaults left out), so a link is shareable and
// Back works:
//   period=<preset id> | custom (+ from=YYYY-MM-DD&to=YYYY-MM-DD, `to` inclusive)
//   group=day|week|month   only when chosen; otherwise it follows the range length
//   machine, flavor, dispensed=true|false, tenant (staff on /sales), result (staff), view (the tab)
// API bounds: `from` = the first day's 00:00, `to` = the day after the last one, 00:00 (exclusive),
// both as offset ISO strings.
import { addDaysKey, daysBetweenKeys, isDateKey, localDateKey, localMidnightIso, mondayKey, monthStartKey } from '../../lib/time.js';

export const PRESETS = ['today', 'yesterday', 'last_7_days', 'last_30_days', 'this_month', 'last_month', 'last_12_weeks', 'last_12_months'];
export const CUSTOM = 'custom';
export const DEFAULT_PERIOD = 'last_30_days';
export const GROUPS = ['day', 'week', 'month'];
export const RESULTS = ['success', 'timeout', 'rejected', 'no_response'];
export const VIEWS = ['overview', 'not-dispensed'];

/** A preset's days: {first, last} date keys, both inclusive. */
export function presetDays(id, today) {
  switch (id) {
    case 'today': return { first: today, last: today };
    case 'yesterday': return { first: addDaysKey(today, -1), last: addDaysKey(today, -1) };
    case 'last_7_days': return { first: addDaysKey(today, -6), last: today };
    case 'this_month': return { first: monthStartKey(today), last: today };
    case 'last_month': return { first: monthStartKey(today, -1), last: addDaysKey(monthStartKey(today), -1) };
    case 'last_12_weeks': return { first: addDaysKey(mondayKey(today), -77), last: today };
    case 'last_12_months': return { first: monthStartKey(today, -11), last: today };
    default: return { first: addDaysKey(today, -29), last: today };   // last_30_days
  }
}

/** ≤ 31 days → day, ≤ 26 weeks → week, else month. */
export function defaultGroup(days) {
  if (days <= 31) return 'day';
  if (days <= 26 * 7) return 'week';
  return 'month';
}

const pick = (value, allowed) => (allowed.includes(value) ? value : null);
const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** URLSearchParams → filters. Anything unknown or malformed falls back to its default. */
export function parseFilters(params) {
  const get = (k) => params.get(k);
  let period = pick(get('period'), [...PRESETS, CUSTOM]) ?? DEFAULT_PERIOD;
  let from = null;
  let to = null;
  if (period === CUSTOM) {
    from = isDateKey(get('from')) ? get('from') : null;
    to = isDateKey(get('to')) ? get('to') : null;
    if (!from || !to) period = DEFAULT_PERIOD;
    else if (to < from) [from, to] = [to, from];
    if (period !== CUSTOM) from = to = null;
  }
  const dispensed = pick(get('dispensed'), ['true', 'false']);
  return {
    period, from, to,
    group: pick(get('group'), GROUPS),
    machine: text(get('machine')),
    flavor: text(get('flavor')),
    dispensed,
    tenant: text(get('tenant')),
    result: pick(get('result'), RESULTS),
    view: pick(get('view'), VIEWS) ?? 'overview',
  };
}

/** filters → a query string (no leading '?'), defaults left out, in a stable order. */
export function toSearch(f) {
  const q = new URLSearchParams();
  if (f.view && f.view !== 'overview') q.set('view', f.view);
  if (f.period && f.period !== DEFAULT_PERIOD) q.set('period', f.period);
  if (f.period === CUSTOM) {
    q.set('from', f.from);
    q.set('to', f.to);
  }
  for (const k of ['group', 'tenant', 'machine', 'flavor', 'dispensed', 'result']) if (f[k]) q.set(k, f[k]);
  return q.toString();
}

/**
 * The filters' days and API bounds at `now` in tz:
 * {first, last (inclusive date keys), days, from, to (offset ISO), group (chosen or by length)}
 */
export function rangeOf(f, now, tz) {
  const today = localDateKey(now, tz);
  const { first, last } = f.period === CUSTOM ? { first: f.from, last: f.to } : presetDays(f.period, today);
  const days = daysBetweenKeys(first, last) + 1;
  return {
    first, last, days,
    from: localMidnightIso(first, tz),
    to: localMidnightIso(addDaysKey(last, 1), tz),
    group: f.group ?? defaultGroup(days),
  };
}

/**
 * The summary query for a group. `tenant` is the page's tenant (/t/:tid/sales) or the staff filter
 * (/sales); `result` only goes out for staff (the server refuses it for others).
 */
export function summaryQuery(group, f, range, opts) {
  return new URLSearchParams({ group, ...Object.fromEntries(filterParams(f, range, opts)) }).toString();
}

/**
 * The filter params every sales read shares (summary, list, CSV): the range, tenant, machine,
 * flavor, dispensed, and result for staff. `patch` overrides (the Not dispensed tab:
 * {dispensed: 'false'}).
 */
export function filterParams(f, range, { tenant, staff }, patch = {}) {
  const q = new URLSearchParams({ from: range.from, to: range.to });
  if (tenant) q.set('tenant', tenant);
  if (f.machine) q.set('machine', f.machine);
  if (f.flavor) q.set('flavor', f.flavor);
  if (f.dispensed) q.set('dispensed', f.dispensed);
  if (staff && f.result) q.set('result', f.result);
  for (const [k, v] of Object.entries(patch)) q.set(k, v);
  return q;
}

/** How many filters differ from the defaults (the phone's "Filters (n)"). */
export function activeCount(f) {
  return [f.period !== DEFAULT_PERIOD, f.group, f.tenant, f.machine, f.flavor, f.dispensed, f.result].filter(Boolean).length;
}

/** The filters with the defaults (keeps the tab and, on a tenant page, nothing else). */
export function resetFilters(f) {
  return { ...parseFilters(new URLSearchParams()), view: f.view };
}
