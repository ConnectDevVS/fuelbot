// The kiosk API (plan §3), mounted at /fuelbot.
import express from 'express';
import { identifyMachine, touchLastSeen } from '../auth/machine.js';
import { machineConfig } from '../services/catalog.js';
import { HttpError } from '../errors.js';

export function kioskRouter() {
  const router = express.Router();
  router.use(identifyMachine);

  router.get('/config', async (req, res) => {
    touchLastSeen(req);
    if (!req.kiosk.known) throw new HttpError(404, 'unknown_machine');
    res.set('Cache-Control', 'no-store');
    res.json(await machineConfig(req.kiosk.machine));
  });

  return router;
}
