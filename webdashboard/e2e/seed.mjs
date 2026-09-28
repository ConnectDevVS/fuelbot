// Fixed data for the browser tests (SRV-31), written through the server's models and services.
// Times are relative to "now", so "today" always has sales. Deterministic (seeded random).
//   tenants   powerfuel (PowerFuel Gym, PF), globex (Globex Fitness, GX)
//   machines  DEV00001 Bay 02 (6 items, open HOMING_TIMEOUT, online), E2E00002 Bay 3 (online, hoppers 1/2
//             swapped after a refill), E2E00003 Bay 4 (not configured, never seen), E2E00004 Old bay
//             (disabled), E2E00005 (globex)
//   stock     DEV00001: h1 empty, h2 low, h3 ok, h4 not estimated, h5 unknown; E2E00002 h1 refill needed
//   users     USERS below, password PASSWORD
import { Machine, Product, Sale, StockEvent, Tenant, TelemetryEvent, User }
  from '../../server/src/models/index.js';
import { importConfig } from '../../server/src/services/catalog.js';
import { createMachine } from '../../server/src/services/machines.js';
import { issueKey } from '../../server/src/services/keys.js';
import { applyHealthEvent } from '../../server/src/services/health.js';
import { hashPassword } from '../../server/src/auth/passwords.js';
import { readConfigFile, stripImageUrls } from '../../server/scripts/lib.js';

export const PASSWORD = 'e2e password 123';

export const USERS = {
  staff: { email: 'staff@fuelbot.test', name: 'Staff', role: 'platform_admin' },
  owner: { email: 'owner@powerfuel.test', name: 'Owner', role: 'tenant_admin', tenant_id: 'powerfuel' },
  desk: { email: 'desk@powerfuel.test', name: 'Desk', role: 'operator', tenant_id: 'powerfuel', machines: ['DEV00001'] },
  ops: { email: 'ops@powerfuel.test', name: 'Ops', role: 'operator', tenant_id: 'powerfuel' },
  look: { email: 'look@powerfuel.test', name: 'Look', role: 'viewer', tenant_id: 'powerfuel' },
  fresh: { email: 'new@powerfuel.test', name: 'New', role: 'viewer', tenant_id: 'powerfuel', must_change_password: true },
  boss: { email: 'boss@globex.test', name: 'Boss', role: 'tenant_admin', tenant_id: 'globex' },
};

export const COUNTS = { powerfuelSales: 120, notDispensed: 9, globexSales: 3, powerfuelMachines: 4 };

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const IST = 5.5 * HOUR;   // Asia/Kolkata has no DST
const CONFIG = new URL('../../mockserver/responses/config/default.json', import.meta.url).pathname;
const REASONS = [['timeout', 'deadline'], ['rejected', 'machine_fault'], ['no_response', '']];

/** mulberry32: the same data every run. */
function random(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Instants that matter in IST: the start of today, of this ISO week (Monday) and of this month. */
function istBoundaries(now) {
  const today = Math.floor((now + IST) / DAY) * DAY - IST;
  const dow = new Date(today + IST).getUTCDay();   // 0 = Sunday
  const monday = today - ((dow + 6) % 7) * DAY;
  const d = new Date(today + IST);
  const month = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - IST;
  return { today, monday, month };
}

async function sale(fields, product, { stages = true } = {}) {
  const dispensed = fields.dispensing_result === 'success';
  const ts = fields.ts;
  const record = await Sale.create({
    order_number: 0, base_id: 'water', currency: 'INR', payment_method: 'upi', transaction_id: `pay_${fields.order_id}`,
    actual_price: product.actual_price, offer_price: product.offer_price ?? undefined,
    charged_price: product.offer_price ?? product.actual_price, flavor_id: product.product_id,
    received_at: ts, machine_known: true, dispensing_reason: '', ...fields,
  });
  if (stages && fields.machine_known !== false) {
    const cycleTs = new Date(ts.getTime() + 70 * 1000);
    await TelemetryEvent.create({
      event_id: `cycle-${fields.order_id}`, event_type: 'dispense_cycle', source: 'bridge', tenant_id: fields.tenant_id,
      machine_id: fields.machine_id, order_id: fields.order_id, hopper: fields.hopper, flavor_id: product.product_id,
      base: 2, result: dispensed ? 'DONE' : fields.dispensing_result.toUpperCase(),
      stages: [{ stage: 'HOMING_DONE', t_offset_ms: 1800 },
        ...(dispensed ? [{ stage: 'PROTEIN_DISPENSED', t_offset_ms: 7600 }, { stage: 'DONE', t_offset_ms: 70000 }] : [])],
      ts: cycleTs, received_at: cycleTs, machine_known: true,
    });
  }
  return record;
}

async function healthEvent(fields) {
  const record = await TelemetryEvent.create({ source: 'bridge', received_at: fields.ts, machine_known: true, ...fields });
  await applyHealthEvent(record.toObject());
}

export async function seed(now = Date.now()) {
  const rand = random(20260928);
  const config = () => stripImageUrls(readConfigFile(CONFIG));
  const { today, monday, month } = istBoundaries(now);

  // Tenants and machines.
  await importConfig({ tenantId: 'powerfuel', tenantName: 'PowerFuel Gym', machineId: 'DEV00001', config: config() });
  await importConfig({ tenantId: 'powerfuel', machineId: 'E2E00002', config: config() });
  await importConfig({ tenantId: 'powerfuel', machineId: 'E2E00004', config: config() });
  await createMachine({ tenant_id: 'powerfuel', name: 'Bay 4', location_label: 'FUELBOT · BAY 04', site: 'Level 2' },
    { idSource: () => 'E2E00003' });
  await importConfig({ tenantId: 'globex', tenantName: 'Globex Fitness', machineId: 'E2E00005', config: config() });
  await Tenant.updateOne({ _id: 'globex' },
    { branding: { display_name: 'Globex Fitness', logo_text: 'GX', support_phone: '1800 000 0000' } });
  const seen = new Date(now - 20 * 1000);
  await Machine.updateOne({ _id: 'DEV00001' }, { name: 'Bay 02', location_label: 'FUELBOT · BAY 02', site: 'Ground floor', last_seen_at: seen });
  await Machine.updateOne({ _id: 'E2E00002' }, { name: 'Bay 3', location_label: 'FUELBOT · BAY 03', site: 'Ground floor', last_seen_at: seen });
  await Machine.updateOne({ _id: 'E2E00004' }, { name: 'Old bay', location_label: 'FUELBOT · OLD', disabled: true,
    last_seen_at: new Date(now - 40 * DAY) });
  await Machine.updateOne({ _id: 'E2E00005' }, { name: 'Globex Main', location_label: 'GLOBEX · MAIN', last_seen_at: seen });

  // Users.
  const users = {};
  const hash = await hashPassword(PASSWORD, 4);
  for (const [key, fields] of Object.entries(USERS)) {
    users[key] = await User.create({ password_hash: hash, machines: [], ...fields });
  }
  await issueKey({ _id: 'DEV00001', tenant_id: 'powerfuel' }, { label: 'Bay 02 kiosk', createdBy: users.staff._id });

  // Stock inputs: portion sizes on 4 products (vanilla, hopper 4, and coffee stay without).
  for (const pid of ['guava', 'chocolate', 'electro', 'cookie']) {
    await Product.updateOne({ tenant_id: 'powerfuel', product_id: pid }, { portion_g: 32.5 });
  }
  const refillAt = new Date(now - 5 * 1000);   // after every seeded dose: the states below are exact
  const refill = (machine, hopper, product, level) => StockEvent.create({ tenant_id: 'powerfuel', machine_id: machine,
    hopper, product_id: product, kind: 'refill', level_g: level, note: '', user_id: users.owner._id,
    user_email: users.owner.email, at: refillAt });
  await refill('DEV00001', 1, 'guava', 20);        // < one portion: empty
  await refill('DEV00001', 2, 'chocolate', 325);   // 10 portions: low (≤ 15)
  await refill('DEV00001', 3, 'electro', 2000);    // ok
  await refill('E2E00002', 1, 'guava', 2000);      // then the menu swaps hoppers 1 and 2: refill needed
  const bay3 = await Machine.findById('E2E00002');
  bay3.menu = bay3.menu.map((i) => {
    const item = i.toObject();
    if (item.hopper === 1) return { ...item, hopper: 2 };
    if (item.hopper === 2) return { ...item, hopper: 1 };
    return item;
  });
  bay3.menu_version += 1;
  await bay3.save();

  // Sales: 120 for powerfuel over 70 days (today, and both sides of a week and a month boundary
  // in IST included), 9 of them not dispensed; 3 for globex; one from an unregistered machine.
  const products = new Map((await Product.find({ tenant_id: 'powerfuel' }).lean()).map((p) => [p.product_id, p]));
  const menus = new Map((await Machine.find({ _id: { $in: ['DEV00001', 'E2E00002'] } }).lean())
    .map((m) => [m._id, m.menu.filter((i) => i.enabled && !i.sold_out)]));
  const latest = now - 10 * MIN;
  const fixed = [
    ...[1, 2, 3, 4, 5, 6].map((k) => Math.max(today + MIN, latest - k * 7 * MIN)),   // today
    monday - MIN, monday + MIN,                                                      // Sun 23:59 / Mon 00:01 IST
    month - MIN, month + MIN,                                                        // month end / start
  ].filter((t) => t > now - 70 * DAY && t <= latest);
  const times = [...fixed];
  while (times.length < COUNTS.powerfuelSales) times.push(latest - rand() * 70 * DAY);
  times.sort((a, b) => a - b);
  // Not dispensed: 9 spread over the range, one of them today (the newest).
  const failed = new Set([5, 17, 30, 44, 58, 71, 85, 99, times.length - 1]);
  let n = 0;
  for (const [i, t] of times.entries()) {
    n += 1;
    const machine = rand() < 0.6 ? 'DEV00001' : 'E2E00002';
    const menu = menus.get(machine);
    const item = menu[Math.floor(rand() * menu.length)];
    const [result, reason] = failed.has(i) ? REASONS[n % REASONS.length] : ['success', ''];
    await sale({ order_id: `E2E-PF-${String(n).padStart(4, '0')}`, order_number: n, tenant_id: 'powerfuel',
      machine_id: machine, hopper: item.hopper, ts: new Date(t), dispensing_result: result, dispensing_reason: reason },
    products.get(item.product_id));
  }
  const gx = new Map((await Product.find({ tenant_id: 'globex' }).lean()).map((p) => [p.product_id, p]));
  for (const k of [1, 2, 3]) {
    await sale({ order_id: `E2E-GX-${k}`, order_number: k, tenant_id: 'globex', machine_id: 'E2E00005', hopper: 1,
      ts: new Date(Math.max(today + MIN, latest - k * 11 * MIN)), dispensing_result: 'success' }, gx.get('guava'));
  }
  await sale({ order_id: 'E2E-UNREG-1', tenant_id: 'powerfuel', machine_id: 'ZZTYPO01', hopper: 1, machine_known: false,
    ts: new Date(now - 2 * HOUR), dispensing_result: 'success' }, products.get('guava'), { stages: false });

  // Health: a bridge outage on Bay 3 two days ago (closed), and an open HOMING_TIMEOUT on Bay 02.
  await healthEvent({ event_id: 'e2e-bridge-down', event_type: 'bridge_down', tenant_id: 'powerfuel',
    machine_id: 'E2E00002', silent_sec: 30, ts: new Date(now - 2 * DAY) });
  await healthEvent({ event_id: 'e2e-bridge-up', event_type: 'bridge_up', tenant_id: 'powerfuel',
    machine_id: 'E2E00002', down_sec: 900, ts: new Date(now - 2 * DAY + 15 * MIN) });
  await healthEvent({ event_id: 'e2e-homing', event_type: 'machine_fault', tenant_id: 'powerfuel',
    machine_id: 'DEV00001', fault: 'HOMING_TIMEOUT', ts: new Date(now - 3 * HOUR) });
}

/** Empties every collection (the test harness's reset), then seeds again (POST /__e2e/reset). */
export async function reseed(ctx) {
  await ctx.reset();
  await seed();
}
