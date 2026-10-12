// The Menu tab's model (dashboard plan §5.6.1; SRV-43) as pure functions. Form rows ⇄ the API's
// menu items: the order is the list order; `low_portions` rides along untouched (a save must not
// clear it, and changing it needs stock:write); a price override is {actual_price, offer_price} or
// null for "the product's price". Client warnings don't block Save: the server's 422 decides.

export const MAX_ITEMS = 12;
export const HOPPERS = [1, 2, 3, 4, 5, 6];
export const WIRING_HOPPERS = new Set([5, 6]);   // placeholders in the firmware (kiosk open item)
export const BADGES = ['POPULAR', 'NEW'];

/** Menu items (GET machine) → form rows. */
export function toRows(menu = []) {
  return menu.map((i) => ({
    product_id: i.product_id,
    hopper: i.hopper,
    enabled: i.enabled ?? true,
    sold_out: i.sold_out ?? false,
    badge: i.badge ?? null,
    override: Boolean(i.price),
    actual_price: i.price?.actual_price ?? null,
    offer_price: i.price?.offer_price ?? null,
    low_portions: i.low_portions ?? null,
  }));
}

/** Form rows → the PUT body's menu, in order. */
export function toPayload(rows = []) {
  return rows.map((r) => ({
    product_id: r.product_id,
    hopper: r.hopper,
    enabled: Boolean(r.enabled),
    sold_out: Boolean(r.sold_out),
    badge: r.badge && String(r.badge).trim() ? String(r.badge).trim() : null,
    price: r.override ? { actual_price: r.actual_price, offer_price: r.offer_price ?? null } : null,
    low_portions: r.low_portions ?? null,
  }));
}

/** The lowest hopper no enabled row uses (1 when all are taken). */
export function lowestFreeHopper(rows = []) {
  const used = new Set(rows.filter((r) => r.enabled).map((r) => r.hopper));
  return HOPPERS.find((h) => !used.has(h)) ?? HOPPERS[0];
}

/** A new row for a product: the lowest free hopper, enabled, not sold out, no badge, no override. */
export function newRow(productId, rows = []) {
  return { product_id: productId, hopper: lowestFreeHopper(rows), enabled: true, sold_out: false, badge: null,
    override: false, actual_price: null, offer_price: null, low_portions: null };
}

/** rows with the item at `from` moved to `to`. */
export function move(rows, from, to) {
  const next = [...rows];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Client warnings: {duplicates: Map row index → index of the first enabled row on that hopper,
 * empty, wiring: row indexes on hoppers 5–6 (enabled)}. Disabled rows don't count (the kiosk hides
 * them).
 */
export function warnings(rows = []) {
  const first = new Map();
  const duplicates = new Map();
  const wiring = [];
  rows.forEach((r, i) => {
    if (!r?.enabled) return;
    if (first.has(r.hopper)) duplicates.set(i, first.get(r.hopper));
    else first.set(r.hopper, i);
    if (WIRING_HOPPERS.has(r.hopper)) wiring.push(i);
  });
  return { duplicates, empty: rows.length === 0, wiring };
}

/**
 * A 422 invalid_config's messages for this machine, by product id: the app writes them as
 * "<product_id>: <problem>". → Map product_id → [messages]; the rest under ''.
 */
export function configErrorsByProduct(error, machineId) {
  const out = new Map();
  const details = Array.isArray(error?.details) ? error.details : [];
  for (const d of details.filter((x) => !machineId || x.machine_id === machineId)) {
    for (const message of d.errors ?? []) {
      const m = /^([a-z0-9_-]+):\s/.exec(message);
      const key = m ? m[1] : '';
      out.set(key, [...(out.get(key) ?? []), message]);
    }
  }
  return out;
}
