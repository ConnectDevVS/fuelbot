// Every catalog write goes through here (plan §4.1): build the machine config(s) a change would
// produce and refuse it if the app would reject any of them. The model hooks call the same checks.
import { Machine, Product, Tenant } from '../models/index.js';
import { buildConfig } from '../catalog/build.js';
import { validateAll } from '../catalog/validate.js';
import { CatalogError } from '../errors.js';

const plain = (doc) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : doc);

async function productsFor(tenantId, productIds) {
  const list = await Product.find({ tenant_id: tenantId, product_id: { $in: [...new Set(productIds)] } }).lean();
  return new Map(list.map((p) => [p.product_id, p]));
}

/** The config body a machine gets. Throws if the tenant is missing. */
export async function machineConfig(machine) {
  const m = plain(machine);
  const tenant = await Tenant.findById(m.tenant_id).lean();
  if (!tenant) throw new Error(`tenant ${m.tenant_id} not found for machine ${m._id}`);
  return buildConfig(tenant, m, await productsFor(m.tenant_id, m.menu.map((i) => i.product_id)));
}

/** Errors the app would report for this machine's config ([] = valid). */
export async function machineErrors(machine) {
  return validateAll(await machineConfig(machine));
}

/** Refuses a machine whose config the app would reject. */
export async function assertMachineValid(machine) {
  const errors = await machineErrors(machine);
  if (errors.length) throw new CatalogError([{ machine_id: plain(machine)._id, errors }]);
}

/** Refuses a product change that would break any machine whose menu uses the product. */
export async function assertProductValid(product) {
  const p = plain(product);
  const machines = await Machine.find({ tenant_id: p.tenant_id, 'menu.product_id': p.product_id }).lean();
  if (machines.length === 0) return;
  const tenant = await Tenant.findById(p.tenant_id).lean();
  const details = [];
  for (const m of machines) {
    const products = await productsFor(p.tenant_id, m.menu.map((i) => i.product_id));
    products.set(p.product_id, p);
    const errors = validateAll(buildConfig(tenant, m, products));
    if (errors.length) details.push({ machine_id: m._id, errors });
  }
  if (details.length) throw new CatalogError(details);
}

function parseDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Imports an app config body (the kiosk's schema) as a tenant's products plus one machine's menu
 * (stories/kiosk-api decision 4). Creates or updates in place. The raw config is validated first.
 */
export async function importConfig({ tenantId, tenantName, machineId, config }) {
  const errors = validateAll(config);
  if (errors.length) throw new CatalogError([{ machine_id: machineId, errors }]);
  const existing = await Machine.findById(machineId).lean();
  if (existing && existing.tenant_id !== tenantId) {
    throw new Error(`machine ${machineId} belongs to tenant ${existing.tenant_id}`);
  }
  const header = config.tenant ?? {};

  const tenant = (await Tenant.findById(tenantId)) ?? new Tenant({ _id: tenantId });
  tenant.name = tenantName || tenant.name || header.display_name || tenantId;
  tenant.branding = {
    display_name: header.display_name,
    logo_text: header.logo_text,
    support_phone: header.support_phone,
  };
  tenant.catalog_version += 1;
  await tenant.save();

  for (const f of config.flavors) {
    const product = (await Product.findOne({ tenant_id: tenantId, product_id: f.id }))
      ?? new Product({ tenant_id: tenantId, product_id: f.id });
    product.set({
      name: f.name,
      description: f.description,
      volume_ml: f.volume_ml,
      nutrition: f.nutrition,
      ingredients: f.ingredients,
      allergens: f.allergens,
      image_url: f.image_url || undefined,
      image: f.image || undefined,
      actual_price: f.actual_price,
      offer_price: f.offer_price ?? null,
    });
    product.rev += 1;
    await product.save();
  }

  const machine = (await Machine.findById(machineId)) ?? new Machine({ _id: machineId, tenant_id: tenantId });
  const m = config.maintenance ?? {};
  machine.set({
    location_label: header.location_label,
    site: header.site,
    menu: config.flavors.map((f) => ({
      product_id: f.id,
      hopper: f.hopper,
      enabled: f.enabled === true,
      sold_out: f.sold_out === true,
      badge: f.badge ?? null,
    })),
    bases: config.bases ?? [],
    maintenance: {
      enabled: m.enabled === true,
      message: m.message ?? '',
      flagged_by: m.flagged_by ?? null,
      flagged_at: parseDate(m.flagged_at),
      faults: m.faults ?? [],
    },
    idle_video_url: config.idle_video_url ?? null,
  });
  machine.menu_version += 1;
  await machine.save();
  return { tenant: tenant.toObject(), machine: machine.toObject() };
}
