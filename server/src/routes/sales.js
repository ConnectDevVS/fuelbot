// /api/v1/sales (plan §4.9): list, summary, CSV. Scoped to the caller; tenant users get the
// tenant view ("dispensed", no reasons), platform the whole record.
import express from 'express';
import { once } from 'node:events';
import { Sale } from '../models/index.js';
import { guard, isPlatform } from '../auth/rbac.js';
import { dayKey, recordPage, scopedFilter } from '../services/records.js';
import { platformSaleView, tenantSaleView } from '../services/views.js';
import { HttpError } from '../errors.js';

const PLATFORM_COLUMNS = ['ts', 'order_id', 'order_number', 'tenant_id', 'machine_id', 'flavor_id', 'hopper', 'base_id',
  'actual_price', 'offer_price', 'charged_price', 'currency', 'payment_method', 'transaction_id', 'dispensing_result',
  'dispensing_reason', 'machine_known', 'received_at'];
const TENANT_COLUMNS = ['ts', 'order_id', 'order_number', 'machine_id', 'flavor_id', 'base_id', 'actual_price',
  'offer_price', 'charged_price', 'currency', 'payment_method', 'transaction_id', 'dispensed'];

/** Scope + filters, including the sales-only ones (flavor, dispensed; result for platform). */
function salesFilter(user, q) {
  const filter = scopedFilter(user, q);
  if (typeof q.flavor === 'string' && q.flavor) filter.flavor_id = q.flavor;
  if (q.dispensed !== undefined) {
    if (!['true', 'false'].includes(q.dispensed)) throw new HttpError(400, 'invalid_dispensed');
    filter.dispensing_result = q.dispensed === 'true' ? 'success' : { $ne: 'success' };
  }
  if (q.result !== undefined) {
    if (!isPlatform(user)) throw new HttpError(400, 'unknown_filter', ['result']);
    filter.dispensing_result = String(q.result);
  }
  return filter;
}

/** RFC 4180, and a leading ' on cells a spreadsheet would run as a formula. */
export function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const GROUPS = {
  day: (tz) => ({ $dateToString: { format: '%Y-%m-%d', date: '$ts', timezone: tz } }),
  flavor: () => '$flavor_id',
  machine: () => '$machine_id',
  tenant: () => '$tenant_id',
};

export function salesRouter() {
  const router = express.Router();
  router.use(guard('sales:read'));

  router.get('/', async (req, res) => {
    const view = isPlatform(req.user) ? platformSaleView : tenantSaleView;
    res.json(await recordPage(Sale, salesFilter(req.user, req.query), req.query, view));
  });

  router.get('/summary', async (req, res) => {
    const group = String(req.query.group ?? 'day');
    if (!GROUPS[group]) throw new HttpError(400, 'invalid_group');
    if (group === 'tenant' && !isPlatform(req.user)) throw new HttpError(403, 'forbidden');
    const tz = req.app.locals.settings.displayTz;
    const notDispensed = { $ne: ['$dispensing_result', 'success'] };
    const rows = await Sale.aggregate([
      { $match: salesFilter(req.user, req.query) },
      { $group: {
        _id: GROUPS[group](tz),
        count: { $sum: 1 },
        revenue: { $sum: { $ifNull: ['$charged_price', 0] } },
        not_dispensed: { $sum: { $cond: [notDispensed, 1, 0] } },
        not_dispensed_amount: { $sum: { $cond: [notDispensed, { $ifNull: ['$charged_price', 0] }, 0] } },
      } },
      { $sort: group === 'day' ? { _id: 1 } : { revenue: -1, _id: 1 } },
    ]);
    const items = rows.map(({ _id, ...r }) => ({ key: _id, ...r }));
    const totals = items.reduce((t, r) => ({
      count: t.count + r.count, revenue: t.revenue + r.revenue,
      not_dispensed: t.not_dispensed + r.not_dispensed, not_dispensed_amount: t.not_dispensed_amount + r.not_dispensed_amount,
    }), { count: 0, revenue: 0, not_dispensed: 0, not_dispensed_amount: 0 });
    res.json({ group, tz, items, totals });
  });

  // Streamed from a database cursor: no size limit, constant memory.
  router.get('/export.csv', async (req, res) => {
    const platform = isPlatform(req.user);
    const filter = salesFilter(req.user, req.query);
    const columns = platform ? PLATFORM_COLUMNS : TENANT_COLUMNS;
    const view = platform ? platformSaleView : tenantSaleView;
    res.type('text/csv; charset=utf-8');
    res.attachment(`sales-${dayKey(new Date(), req.app.locals.settings.displayTz)}.csv`);
    res.write(`${columns.join(',')}\r\n`);
    for await (const sale of Sale.find(filter).sort({ ts: -1, _id: -1 }).lean().cursor()) {
      const row = view(sale);
      if (!res.write(`${columns.map((c) => csvCell(row[c])).join(',')}\r\n`)) await once(res, 'drain');
    }
    res.end();
  });

  return router;
}
