// Estimated stock per hopper (plan §4.13): the latest refill/adjustment minus one portion for
// every dispense cycle that actually dosed that hopper since (PROTEIN_DISPENSED).
import { Product, StockEvent, TelemetryEvent } from '../models/index.js';

const DAY_MS = 24 * 3600 * 1000;
const STATE_ORDER = ['empty', 'low', 'refill_needed', 'unknown', 'not_estimated', 'ok'];

/** Doses of a hopper: dispense cycles whose stages include PROTEIN_DISPENSED, after `since`. */
function countDoses(machine, hopper, since) {
  return TelemetryEvent.countDocuments({
    tenant_id: machine.tenant_id,
    machine_id: machine._id,
    event_type: 'dispense_cycle',
    hopper,
    'stages.stage': 'PROTEIN_DISPENSED',
    ts: { $gt: since },
  });
}

/**
 * One row per menu item (hopper): product, portion size, threshold, last refill, doses since,
 * grams / portions / days left, and a state (stories/stock decision 5).
 */
export async function machineStock(machine, settings, now = new Date()) {
  const ids = machine.menu.map((i) => i.product_id);
  const products = new Map((await Product.find({ tenant_id: machine.tenant_id, product_id: { $in: ids } }).lean())
    .map((p) => [p.product_id, p]));
  const rows = [];
  for (const item of [...machine.menu].sort((a, b) => a.hopper - b.hopper)) {
    const product = products.get(item.product_id);
    const portion = product?.portion_g ?? null;
    const low = item.low_portions ?? settings.stockLowPortions;
    const latest = await StockEvent.findOne({ machine_id: machine._id, hopper: item.hopper }).sort({ at: -1, _id: -1 }).lean();
    const row = {
      hopper: item.hopper,
      product_id: item.product_id,
      product_name: product?.name ?? null,
      portion_g: portion,
      low_portions: low,
      last_refill: latest ? { kind: latest.kind, product_id: latest.product_id, level_g: latest.level_g,
        at: latest.at, by: latest.user_email ?? null } : null,
      doses_since: null,
      left_g: null,
      portions_left: null,
      days_left: null,
      state: 'ok',
    };
    if (!portion) row.state = 'not_estimated';
    else if (!latest) row.state = 'unknown';
    else if (latest.product_id !== item.product_id) row.state = 'refill_needed';
    else {
      const doses = await countDoses(machine, item.hopper, latest.at);
      const recent = await countDoses(machine, item.hopper, new Date(now.getTime() - 7 * DAY_MS));
      row.doses_since = doses;
      row.left_g = Math.max(latest.level_g - doses * portion, 0);
      row.portions_left = Math.floor(row.left_g / portion + 1e-9);
      row.days_left = recent ? Math.round((row.portions_left / (recent / 7)) * 10) / 10 : null;
      if (row.portions_left === 0) row.state = 'empty';
      else if (row.portions_left <= low) row.state = 'low';
    }
    rows.push(row);
  }
  return rows;
}

/** For the fleet list: most urgent first (state, then fewest portions). */
export function byUrgency(a, b) {
  const s = STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state);
  if (s !== 0) return s;
  return (a.portions_left ?? Infinity) - (b.portions_left ?? Infinity);
}

export const STOCK_STATES = STATE_ORDER;
