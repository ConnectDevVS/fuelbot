// Tenant + machine + the products on its menu → the config body the app gets (plan §3.2).
// Pure: takes plain objects (lean docs or toObject()), returns plain JSON-ready data.

/** YYYY-MM-DDTHH:MM:SSZ: the app's Fmt.iso_to_unix rejects milliseconds. */
export function isoNoMs(date) {
  if (date === null || date === undefined) return null;
  return new Date(date).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Copies the keys whose value isn't undefined, in the given order. */
function pick(source, keys) {
  const out = {};
  for (const key of keys) {
    if (source?.[key] !== undefined) out[key] = source[key];
  }
  return out;
}

const NUTRITION_KEYS = ['kcal', 'protein_g', 'carbs_g', 'fat_g'];

function buildFlavor(item, product) {
  const p = product ?? {};
  const price = item.price ?? { actual_price: p.actual_price, offer_price: p.offer_price };
  const flavor = {
    id: item.product_id,
    ...pick(p, ['name']),
    hopper: item.hopper,
    ...pick(price, ['actual_price']),
    offer_price: price.offer_price ?? null,
    ...pick(p, ['image_url', 'image', 'description', 'volume_ml']),
  };
  if (p.nutrition) flavor.nutrition = pick(p.nutrition, NUTRITION_KEYS);
  Object.assign(flavor, pick(p, ['ingredients', 'allergens']));
  flavor.badge = item.badge ?? null;
  flavor.sold_out = item.sold_out ?? false;
  flavor.enabled = item.enabled ?? true;
  return flavor;
}

/**
 * @param tenant   {branding, catalog_version}
 * @param machine  {location_label, site, support_phone, menu, bases, maintenance, idle_video_url, menu_version}
 * @param products Map product_id → product. A menu item whose product is missing still produces an
 *                 entry (id and hopper only), so validation reports it instead of hiding it.
 */
export function buildConfig(tenant, machine, products) {
  const branding = tenant.branding ?? {};
  const header = {
    ...pick(branding, ['display_name', 'logo_text']),
    ...pick(machine, ['location_label', 'site']),
  };
  const phone = machine.support_phone ?? branding.support_phone;
  if (phone !== undefined) header.support_phone = phone;

  const m = machine.maintenance ?? {};
  return {
    version: (machine.menu_version ?? 0) + (tenant.catalog_version ?? 0),
    tenant: header,
    flavors: (machine.menu ?? []).map((item) => buildFlavor(item, products.get(item.product_id))),
    bases: (machine.bases ?? []).map((b) => pick(b, ['id', 'name', 'code', 'enabled'])),
    maintenance: {
      enabled: m.enabled ?? false,
      message: m.message ?? '',
      flagged_by: m.flagged_by ?? null,
      flagged_at: isoNoMs(m.flagged_at),
      faults: (m.faults ?? []).map((f) => pick(f, ['code', 'description'])),
    },
    idle_video_url: machine.idle_video_url ?? null,
  };
}
