// Queries over sales and telemetry (stories/read-apis decisions 1–3): the caller's scope first,
// then filters; client-time order with a (ts, _id) cursor; days in DISPLAY_TZ.
import mongoose from 'mongoose';
import { canSeeMachine, canSeeTenant, hasAllMachines, isPlatform, recordScope } from '../auth/rbac.js';
import { Sale } from '../models/index.js';
import { HttpError } from '../errors.js';
import { DEFAULT_LIMIT, MAX_LIMIT } from './pages.js';

function dateParam(value, name) {
  if (value === undefined) return undefined;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) throw new HttpError(400, `invalid_${name}`);
  return d;
}

/** The caller's scope plus the tenant / machine / from / to filters (404 outside the scope). */
export function scopedFilter(user, query) {
  const filter = recordScope(user);
  if (typeof query.tenant === 'string' && query.tenant) {
    if (!isPlatform(user) && query.tenant !== user.tenant_id) throw new HttpError(404, 'not_found');
    filter.tenant_id = query.tenant;
  }
  if (typeof query.machine === 'string' && query.machine) {
    if (!isPlatform(user) && !hasAllMachines(user) && !user.machines.includes(query.machine)) {
      throw new HttpError(404, 'not_found');
    }
    filter.machine_id = query.machine;
  }
  const from = dateParam(query.from, 'from');
  const to = dateParam(query.to, 'to');
  if (from || to) filter.ts = { ...(from ? { $gte: from } : {}), ...(to ? { $lt: to } : {}) };
  return filter;
}

/**
 * The machine query for /fleet and /stock: the caller's tenant (platform: all), narrowed by
 * ?tenant=. A tenant user naming another tenant gets 404, as in scopedFilter.
 */
export function machineTenantFilter(user, query) {
  const tenant = typeof query.tenant === 'string' && query.tenant ? query.tenant : undefined;
  if (tenant !== undefined && !canSeeTenant(user, tenant)) throw new HttpError(404, 'not_found');
  if (tenant !== undefined) return { tenant_id: tenant };
  return isPlatform(user) ? {} : { tenant_id: user.tenant_id };
}

function decodeCursor(cursor) {
  try {
    const { t, id } = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    const ts = new Date(t);
    if (Number.isNaN(ts.getTime()) || !mongoose.Types.ObjectId.isValid(id)) throw new Error('bad');
    return { ts, id: new mongoose.Types.ObjectId(id) };
  } catch {
    throw new HttpError(400, 'invalid_cursor');
  }
}

/** Newest first by client time: {items, next_cursor}. */
export async function recordPage(Model, filter, query, view) {
  let limit = Number.parseInt(query.limit ?? DEFAULT_LIMIT, 10);
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
  limit = Math.min(limit, MAX_LIMIT);
  let where = filter;
  if (query.cursor) {
    const c = decodeCursor(query.cursor);
    where = { $and: [filter, { $or: [{ ts: { $lt: c.ts } }, { ts: c.ts, _id: { $lt: c.id } }] }] };
  }
  const rows = await Model.find(where).sort({ ts: -1, _id: -1 }).limit(limit + 1).lean();
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items: items.map(view),
    next_cursor: rows.length > limit
      ? Buffer.from(JSON.stringify({ t: last.ts.toISOString(), id: String(last._id) })).toString('base64url') : null,
  };
}

/** 'YYYY-MM-DD' of `date` in the time zone. */
export function dayKey(date, tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(date);
}

/** 'YYYY-MM-DD HH:MM:SS' of `date` in the time zone (the CSV's local_time). */
export function localTime(date, tz) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

/** machine_id → today's {count, revenue, not_dispensed, not_dispensed_amount, last_sale_at} (tz days). */
export async function salesToday(machineIds, tz, now = new Date()) {
  const today = dayKey(now, tz);
  const rows = await Sale.aggregate([
    { $match: { machine_id: { $in: machineIds }, ts: { $gte: new Date(now.getTime() - 48 * 3600 * 1000) } } },
    { $addFields: { day: { $dateToString: { format: '%Y-%m-%d', date: '$ts', timezone: tz } } } },
    { $match: { day: today } },
    { $group: {
      _id: '$machine_id',
      count: { $sum: 1 },
      revenue: { $sum: { $ifNull: ['$charged_price', 0] } },
      not_dispensed: { $sum: { $cond: [{ $eq: ['$dispensing_result', 'success'] }, 0, 1] } },
      not_dispensed_amount: { $sum: { $cond: [{ $eq: ['$dispensing_result', 'success'] }, 0, { $ifNull: ['$charged_price', 0] }] } },
      last_sale_at: { $max: '$ts' },
    } },
  ]);
  return new Map(rows.map(({ _id, ...r }) => [_id, r]));
}

export const EMPTY_TODAY = { count: 0, revenue: 0, not_dispensed: 0, not_dispensed_amount: 0, last_sale_at: null };

export { canSeeMachine };
