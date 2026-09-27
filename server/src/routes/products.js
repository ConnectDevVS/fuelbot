// /api/v1/tenants/:tid/products (plan §4.4): the tenant's product library.
// Archived, never deleted. A change is checked against every machine whose menu uses it.
import express from 'express';
import { Machine, Product, Tenant } from '../models/index.js';
import { assertCan, canSeeMachine, can } from '../auth/rbac.js';
import { checkBody, checkVersion, required, T } from '../catalog/input.js';
import { audit, diff } from '../services/audit.js';
import { loadTenant } from './tenants.js';
import { isDuplicateKey } from '../db.js';
import { HttpError } from '../errors.js';

const FIELDS = {
  name: T.nonEmpty(80),
  description: T.nullable(T.string(500)),
  volume_ml: T.nullable(T.whole(0, 5000)),
  nutrition: T.nullable(T.object({ kcal: T.number(), protein_g: T.number(), carbs_g: T.number(), fat_g: T.number() })),
  ingredients: T.strings(),
  allergens: T.strings(),
  image: T.nullable(T.bundledImage()),
  actual_price: T.rupees(),
  offer_price: T.nullable(T.rupees()),
};
const CREATE = { ...FIELDS, product_id: required(T.slug()), name: required(FIELDS.name), actual_price: required(FIELDS.actual_price) };
const UPDATE = { ...FIELDS, archived: T.bool() };
const PRICE_FIELDS = ['actual_price', 'offer_price'];
const VIEW_FIELDS = ['name', 'description', 'volume_ml', 'nutrition', 'ingredients', 'allergens', 'image', 'image_url',
  'actual_price', 'offer_price', 'archived'];

export function productView(p, machines = []) {
  return {
    id: p.product_id,
    name: p.name,
    description: p.description ?? null,
    volume_ml: p.volume_ml ?? null,
    nutrition: p.nutrition ?? null,
    ingredients: p.ingredients ?? [],
    allergens: p.allergens ?? [],
    image_url: p.image_url ?? null,
    image: p.image ?? null,
    actual_price: p.actual_price,
    offer_price: p.offer_price ?? null,
    archived: Boolean(p.archived),
    rev: p.rev ?? 0,
    machines,
    updated_at: p.updated_at ?? null,
  };
}

/** product_id → ids of the machines (visible to user) whose menu uses it. */
async function machinesUsing(user, tenantId, productIds) {
  const machines = await Machine.find({ tenant_id: tenantId, 'menu.product_id': { $in: productIds } },
    { tenant_id: 1, 'menu.product_id': 1 }).lean();
  const out = new Map(productIds.map((id) => [id, []]));
  for (const m of machines) {
    if (!canSeeMachine(user, m)) continue;
    for (const item of m.menu) out.get(item.product_id)?.push(m._id);
  }
  return out;
}

async function loadProduct(tenantId, productId) {
  const product = await Product.findOne({ tenant_id: tenantId, product_id: productId });
  if (!product) throw new HttpError(404, 'not_found');
  return product;
}

/** Operators may send prices, but not change them (stories/catalog-admin decision 5). */
function assertPriceChange(user, tenantId, current, body) {
  const changes = PRICE_FIELDS.some((k) => k in body && body[k] !== (current?.[k] ?? null));
  if (changes && !can(user, 'price:write', { tenantId })) throw new HttpError(403, 'forbidden_field', PRICE_FIELDS);
}

export function productsRouter() {
  const router = express.Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    const tenant = await loadTenant(req.user, req.params.tid);
    assertCan(req.user, 'catalog:read', { tenantId: tenant._id });
    const filter = { tenant_id: tenant._id };
    if (req.query.archived !== 'true') filter.archived = false;
    const products = await Product.find(filter).sort({ product_id: 1 }).lean();
    const using = await machinesUsing(req.user, tenant._id, products.map((p) => p.product_id));
    res.json({ items: products.map((p) => productView(p, using.get(p.product_id))) });
  });

  router.post('/', async (req, res) => {
    const tenant = await loadTenant(req.user, req.params.tid);
    assertCan(req.user, 'products:create', { tenantId: tenant._id });
    const body = checkBody(req.body, CREATE);
    const { product_id: productId, ...fields } = body;
    for (const k of Object.keys(fields)) if (fields[k] === null && k !== 'offer_price') delete fields[k];
    try {
      const product = await Product.create({ tenant_id: tenant._id, product_id: productId, ...fields, rev: 1 });
      await audit(req, { action: 'product.create', tenant_id: tenant._id, target: `product:${productId}`,
        after: productView(product) });
      res.status(201).json({ product: productView(product) });
    } catch (err) {
      if (isDuplicateKey(err)) throw new HttpError(409, 'product_exists');
      throw err;
    }
  });

  router.get('/:pid', async (req, res) => {
    const tenant = await loadTenant(req.user, req.params.tid);
    assertCan(req.user, 'catalog:read', { tenantId: tenant._id });
    const product = await loadProduct(tenant._id, req.params.pid);
    const using = await machinesUsing(req.user, tenant._id, [product.product_id]);
    res.json({ product: productView(product, using.get(product.product_id)) });
  });

  router.patch('/:pid', async (req, res) => {
    const tenant = await loadTenant(req.user, req.params.tid);
    assertCan(req.user, 'products:edit', { tenantId: tenant._id });
    const product = await loadProduct(tenant._id, req.params.pid);
    const body = checkBody(req.body, UPDATE);
    checkVersion(req, product.rev);
    assertPriceChange(req.user, tenant._id, product, body);
    if (body.archived === true && !product.archived
      && await Machine.exists({ tenant_id: tenant._id, 'menu.product_id': product.product_id })) {
      throw new HttpError(409, 'product_in_use');
    }
    const before = productView(product);
    for (const [k, v] of Object.entries(body)) product.set(k, v === null && k !== 'offer_price' ? undefined : v);
    product.rev += 1;
    await product.save();   // the model hook refuses a change that breaks a machine (422)
    await Tenant.updateOne({ _id: tenant._id }, { $inc: { catalog_version: 1 } });
    const after = productView(product);
    const changes = diff(before, after, VIEW_FIELDS);
    await audit(req, { action: 'product.update', tenant_id: tenant._id, target: `product:${product.product_id}`, ...changes });
    const using = await machinesUsing(req.user, tenant._id, [product.product_id]);
    res.json({ product: productView(product, using.get(product.product_id)) });
  });

  return router;
}
