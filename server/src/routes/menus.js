// /api/v1/tenants/:tid/machines/:mid/menu (plan §4.4): which products a machine sells, on which
// hopper, at what price. Operators edit menus of their machines, but never prices (§4.7).
import express from 'express';
import { Machine, Product } from '../models/index.js';
import { can, canSeeMachine } from '../auth/rbac.js';
import { checkBody, checkVersion, required, T } from '../catalog/input.js';
import { loadMachine, respond, saveMachine } from './machines.js';
import { HttpError } from '../errors.js';

const PRICE = T.nullable(T.object({ actual_price: T.rupees(), offer_price: T.nullable(T.rupees()) }));
const ITEM_FIELDS = {
  hopper: T.whole(1, 6),
  enabled: T.bool(),
  sold_out: T.bool(),
  badge: T.nullable(T.string(20)),
  price: PRICE,
  low_portions: T.nullable(T.whole(0, 1000)),
};
const ITEM = T.object({ ...ITEM_FIELDS, product_id: T.slug() });

const priceKey = (p) => (p ? `${p.actual_price}/${p.offer_price ?? null}` : 'default');

function normalise(item) {
  return {
    product_id: item.product_id,
    hopper: item.hopper,
    enabled: item.enabled ?? true,
    sold_out: item.sold_out ?? false,
    badge: item.badge ?? null,
    price: item.price ? { actual_price: item.price.actual_price, offer_price: item.price.offer_price ?? null } : undefined,
    low_portions: item.low_portions ?? undefined,
  };
}

/** 403 forbidden_field when the new menu changes any product's price override without price:write. */
function assertPrices(req, machine, nextMenu) {
  const current = new Map(machine.menu.map((i) => [i.product_id, priceKey(i.price)]));
  const changed = nextMenu.some((i) => priceKey(i.price) !== (current.get(i.product_id) ?? 'default'));
  if (changed && !can(req.user, 'price:write', { tenantId: machine.tenant_id })) {
    throw new HttpError(403, 'forbidden_field', ['price']);
  }
  const lows = new Map(machine.menu.map((i) => [i.product_id, i.low_portions ?? null]));
  const lowChanged = nextMenu.some((i) => (i.low_portions ?? null) !== (lows.get(i.product_id) ?? null));
  if (lowChanged && !can(req.user, 'stock:write', { tenantId: machine.tenant_id })) {
    throw new HttpError(403, 'forbidden_field', ['low_portions']);
  }
}

/** 400 unless every product exists in the tenant, isn't archived, and appears once. */
async function assertProducts(tenantId, menu) {
  const ids = menu.map((i) => i.product_id);
  const products = await Product.find({ tenant_id: tenantId, product_id: { $in: ids } }, { product_id: 1, archived: 1 }).lean();
  const byId = new Map(products.map((p) => [p.product_id, p]));
  const problems = [];
  const seen = new Set();
  menu.forEach((item, i) => {
    const p = byId.get(item.product_id);
    if (!p) problems.push({ field: `menu[${i}].product_id`, error: 'no such product' });
    else if (p.archived) problems.push({ field: `menu[${i}].product_id`, error: 'archived' });
    if (seen.has(item.product_id)) problems.push({ field: `menu[${i}].product_id`, error: 'listed twice' });
    seen.add(item.product_id);
  });
  if (problems.length) throw new HttpError(400, 'invalid_body', problems);
}

async function replaceMenu(req, machine, menu, action) {
  if (menu.length === 0) throw new HttpError(400, 'invalid_body', [{ field: 'menu', error: 'at least one product' }]);
  await assertProducts(machine.tenant_id, menu);
  assertPrices(req, machine, menu);
  const before = respond(req, machine);
  machine.menu = menu;
  return saveMachine(req, machine, action, before, ['menu']);   // the model hook checks the app's rules (422)
}

export function menusRouter() {
  const router = express.Router({ mergeParams: true });

  router.put('/', async (req, res) => {
    const machine = await loadMachine(req, 'menu:edit');
    const { menu } = checkBody(req.body, { menu: required(T.list(ITEM, 12)) });
    for (const [i, item] of menu.entries()) {
      if (!item.product_id || item.hopper === undefined) {
        throw new HttpError(400, 'invalid_body', [{ field: `menu[${i}]`, error: 'product_id and hopper are required' }]);
      }
    }
    checkVersion(req, machine.menu_version);
    res.json({ machine: await replaceMenu(req, machine, menu.map(normalise), 'menu.update') });
  });

  router.patch('/:pid', async (req, res) => {
    const machine = await loadMachine(req, 'menu:edit');
    const body = checkBody(req.body, ITEM_FIELDS);
    checkVersion(req, machine.menu_version);
    const index = machine.menu.findIndex((i) => i.product_id === req.params.pid);
    if (index < 0) throw new HttpError(404, 'not_found');
    const menu = machine.menu.map((i) => normalise(i.toObject()));
    menu[index] = normalise({ ...menu[index], ...body, price: 'price' in body ? body.price : menu[index].price,
      low_portions: 'low_portions' in body ? body.low_portions : menu[index].low_portions });
    res.json({ machine: await replaceMenu(req, machine, menu, 'menu.item_update') });
  });

  // Copies another machine's menu (same tenant, one the user may edit), price overrides included.
  router.post('/copy-from/:src', async (req, res) => {
    const machine = await loadMachine(req, 'menu:edit');
    checkBody(req.body ?? {}, {});
    checkVersion(req, machine.menu_version);
    const source = await Machine.findOne({ _id: req.params.src, tenant_id: machine.tenant_id }).lean();
    if (!source || !canSeeMachine(req.user, source)) throw new HttpError(404, 'not_found');
    if (source.menu.length === 0) throw new HttpError(400, 'source_not_configured');
    res.json({ machine: await replaceMenu(req, machine, source.menu.map(normalise), 'menu.copy') });
  });

  return router;
}
