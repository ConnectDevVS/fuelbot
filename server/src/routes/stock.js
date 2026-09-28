// /api/v1/tenants/:tid/machines/:mid/stock (plan §4.13): refills and adjustments (stock:write),
// history, and the estimate (services/stock.js).
import express from 'express';
import { Machine, StockEvent } from '../models/index.js';
import { canSeeMachine, guard, isPlatform } from '../auth/rbac.js';
import { byUrgency, machineStock, STOCK_STATES } from '../services/stock.js';
import { checkBody, required, T } from '../catalog/input.js';
import { audit } from '../services/audit.js';
import { findPage } from '../services/pages.js';
import { loadMachine } from './machines.js';
import { HttpError } from '../errors.js';

const LEVEL_BODY = { hopper: required(T.whole(1, 6)), level_g: required(T.whole(0, 50000)), note: T.string(200) };

export function stockEventView(e) {
  return {
    id: String(e._id),
    at: e.at,
    kind: e.kind,
    hopper: e.hopper,
    product_id: e.product_id,
    level_g: e.level_g,
    note: e.note ?? '',
    user_email: e.user_email ?? null,
  };
}

/** Records the level of a hopper on the menu, naming the product on it now. */
async function record(req, kind) {
  const machine = await loadMachine(req, 'stock:write');
  const body = checkBody(req.body, LEVEL_BODY);
  const item = machine.menu.find((i) => i.hopper === body.hopper);
  if (!item) throw new HttpError(400, 'invalid_body', [{ field: 'hopper', error: 'not on this machine\'s menu' }]);
  const event = await StockEvent.create({
    tenant_id: machine.tenant_id, machine_id: machine._id, hopper: body.hopper, product_id: item.product_id,
    kind, level_g: body.level_g, note: body.note ?? '', user_id: req.user._id, user_email: req.user.email,
  });
  await audit(req, { action: `stock.${kind}`, tenant_id: machine.tenant_id, machine_id: machine._id,
    target: `hopper:${body.hopper}`, after: { product_id: item.product_id, level_g: body.level_g, note: event.note } });
  return event;
}

export function stockRouter() {
  const router = express.Router({ mergeParams: true });

  router.post('/refills', async (req, res) => {
    res.status(201).json({ event: stockEventView(await record(req, 'refill')) });
  });

  router.post('/adjustments', async (req, res) => {
    res.status(201).json({ event: stockEventView(await record(req, 'adjust')) });
  });

  router.get('/', async (req, res) => {
    const machine = await loadMachine(req);
    res.json({ machine_id: machine._id, items: await machineStock(machine, req.app.locals.settings) });
  });

  router.get('/history', async (req, res) => {
    const machine = await loadMachine(req);
    const filter = { machine_id: machine._id };
    if (req.query.hopper !== undefined) filter.hopper = Number.parseInt(req.query.hopper, 10);
    res.json(await findPage(StockEvent, filter, req.query, stockEventView));
  });

  return router;
}

/** /api/v1/stock?state=low,empty: every hopper needing attention across the caller's machines. */
export function fleetStockRouter() {
  const router = express.Router();
  router.use(guard('machines:read'));

  router.get('/', async (req, res) => {
    const wanted = typeof req.query.state === 'string' && req.query.state
      ? req.query.state.split(',') : STOCK_STATES.filter((s) => s !== 'ok');
    if (wanted.some((s) => !STOCK_STATES.includes(s))) throw new HttpError(400, 'invalid_state');
    const filter = isPlatform(req.user) ? {} : { tenant_id: req.user.tenant_id };
    const machines = (await Machine.find(filter).lean())
      .filter((m) => m.menu.length > 0 && canSeeMachine(req.user, m));
    const items = [];
    for (const m of machines) {
      for (const row of await machineStock(m, req.app.locals.settings)) {
        if (wanted.includes(row.state)) items.push({ tenant_id: m.tenant_id, machine_id: m._id, machine_name: m.name ?? '', ...row });
      }
    }
    res.json({ items: items.sort(byUrgency) });
  });

  return router;
}
