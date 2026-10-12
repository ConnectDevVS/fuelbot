// The kiosk API (plan §3), mounted at /fuelbot.
import express from 'express';
import { identifyMachine, touchLastSeen } from '../auth/machine.js';
import { machineConfig } from '../services/catalog.js';
import { ingest } from '../services/ingest.js';
import { applyHealthEvent } from '../services/health.js';
import { Sale, TelemetryEvent } from '../models/index.js';
import { HttpError } from '../errors.js';

export function kioskRouter() {
  const router = express.Router();
  router.use(identifyMachine);

  router.get('/config', async (req, res) => {
    touchLastSeen(req);
    if (!req.kiosk.known) throw new HttpError(404, 'unknown_machine');
    if (req.kiosk.machine.menu.length === 0) throw new HttpError(409, 'machine_not_configured');
    res.set('Cache-Control', 'no-store');
    res.json(await machineConfig(req.kiosk.machine));
  });

  router.post('/telemetry', async (req, res) => {
    touchLastSeen(req);
    const result = await ingest(TelemetryEvent, req.body, req.kiosk, {
      keyField: 'event_id', requiredFields: ['event_id', 'event_type'], invalidError: 'invalid_event', log: 'telemetry',
    });
    if (!result.duplicate) await applyHealthEvent(result.doc);
    res.status(result.status).json(result.body);
  });

  router.post('/sales', async (req, res) => {
    touchLastSeen(req);
    const result = await ingest(Sale, req.body, req.kiosk, {
      keyField: 'order_id', requiredFields: ['order_id'], invalidError: 'invalid_sale', log: 'sales',
    });
    if (result.duplicate) await warnIfSaleDiffers(result.doc);
    res.status(result.status).json(result.body);
  });

  return router;
}

// The first sale for an order is kept; a repeat with different content is worth a look.
async function warnIfSaleDiffers(doc) {
  const first = await Sale.findOne({ order_id: doc.order_id }).lean();
  const keys = ['charged_price', 'dispensing_result', 'flavor_id', 'machine_id'];
  const changed = keys.filter((k) => first && first[k] !== doc[k]);
  if (changed.length) {
    console.warn(`[sales] duplicate order ${doc.order_id} differs from the first in ${changed.join(', ')}; first kept`);
  }
}
