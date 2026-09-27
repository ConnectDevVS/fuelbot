// /api/v1/orders/:order_id (plan §4.9): one order's sale (caller's view) and, for platform, every
// telemetry event with that order id.
import express from 'express';
import { Sale, TelemetryEvent } from '../models/index.js';
import { guard, isPlatform, recordScope } from '../auth/rbac.js';
import { platformSaleView, tenantSaleView } from '../services/views.js';
import { recordView } from './telemetry.js';
import { HttpError } from '../errors.js';

export function ordersRouter() {
  const router = express.Router();
  router.use(guard('sales:read'));

  router.get('/:order_id', async (req, res) => {
    const platform = isPlatform(req.user);
    const sale = await Sale.findOne({ order_id: req.params.order_id, ...recordScope(req.user) }).lean();
    const telemetry = platform
      ? await TelemetryEvent.find({ order_id: req.params.order_id }).sort({ ts: 1, _id: 1 }).lean() : [];
    if (!sale && telemetry.length === 0) throw new HttpError(404, 'not_found');
    const body = { sale: sale ? (platform ? platformSaleView : tenantSaleView)(sale) : null };
    if (platform) body.telemetry = telemetry.map(recordView);
    res.json(body);
  });

  return router;
}
